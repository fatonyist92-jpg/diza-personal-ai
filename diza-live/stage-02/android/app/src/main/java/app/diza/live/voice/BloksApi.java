package app.diza.live.voice;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

final class BloksApi {
    final String origin;
    private volatile String token;

    BloksApi(String input, String token) {
        if (input == null) throw new IllegalArgumentException("Server URL required");
        String u = input.trim();
        try {
            URL parsed = new URL(u);
            if (!"https".equalsIgnoreCase(parsed.getProtocol()) || parsed.getHost().isEmpty()
                || parsed.getUserInfo() != null || parsed.getQuery() != null || parsed.getRef() != null
                || !(parsed.getPath().isEmpty() || "/".equals(parsed.getPath()))) {
                throw new IllegalArgumentException("Use an HTTPS server origin, without path or query");
            }
            origin = "https://" + parsed.getAuthority();
        } catch (java.net.MalformedURLException ex) {
            throw new IllegalArgumentException("Invalid HTTPS server URL");
        }
        this.token = token == null ? "" : token;
    }
    void setToken(String token) { this.token = token == null ? "" : token; }
    JSONObject request(String method, String path, JSONObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(origin + path).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(9000);
        conn.setReadTimeout(15000);
        conn.setRequestMethod(method);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("X-Bloks-Client", "DIZA Live Android Stage2");
        if (!token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = conn.getResponseCode();
            if (status < 200 || status >= 300)
                throw new IllegalStateException("Bloks returned HTTP " + status + (status == 401 ? " (pairing required)" : ""));
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                    if (out.size() > 2_000_000) throw new IllegalStateException("Bloks response too large");
                }
                String value = out.toString(StandardCharsets.UTF_8.name());
                return value.isEmpty() ? new JSONObject() : new JSONObject(value);
            }
        } finally { conn.disconnect(); }
    }
    JSONObject health() throws Exception { return request("GET", "/api/health", null); }
    JSONArray agents() throws Exception { return request("GET", "/api/bots?messages=60", null).getJSONArray("bots"); }
    JSONObject pair(String sixDigitCode) throws Exception {
        if (!sixDigitCode.matches("[0-9]{6}")) throw new IllegalArgumentException("Pairing code must contain 6 digits");
        return request("POST", "/api/pair/claim", new JSONObject()
            .put("credential", sixDigitCode).put("device", "DIZA Live Stage 2 Android"));
    }
    void send(String agentId, String transcript) throws Exception {
        if (!agentId.matches("[A-Za-z0-9_-]{1,128}") || transcript.trim().isEmpty())
            throw new IllegalArgumentException("Invalid agent or transcript");
        request("POST", "/api/bots/" + agentId + "/messages", new JSONObject().put("text", transcript.trim()));
    }
    String claim(String agentId) throws Exception {
        return request("POST", "/api/calls/claim", new JSONObject()
            .put("targetId", agentId).put("device", "DIZA Live Stage 2 Android")).getString("token");
    }
    void renew(String lease) throws Exception {
        request("POST", "/api/calls/renew", new JSONObject().put("token", lease));
    }
    void release(String lease) throws Exception {
        request("DELETE", "/api/calls", new JSONObject().put("token", lease));
    }
    static JSONObject find(JSONArray agents, String id) throws Exception {
        for (int i=0; i<agents.length(); i++) {
            JSONObject b=agents.getJSONObject(i);
            if (id.equals(b.optString("id"))) return b;
        }
        throw new IllegalStateException("Selected Bloks agent not found");
    }
    static Set<String> existingReplies(JSONObject agent) throws Exception {
        Set<String> seen=new HashSet<>();
        JSONArray items=agent.optJSONArray("messages");
        if (items == null) return seen;
        for (int i=0; i<items.length(); i++) {
            JSONObject m=items.getJSONObject(i);
            if ("bot".equals(m.optString("role")) && "text".equals(m.optString("kind"))
                && !m.optBoolean("deleted") && !m.optString("text").trim().isEmpty()) {
                seen.add(m.optString("id", "none-"+i));
            }
        }
        return seen;
    }
    static String newReply(JSONObject agent, Set<String> oldIds) throws Exception {
        if (agent.optBoolean("busy", false)) return null;
        JSONArray messages=agent.optJSONArray("messages");
        if (messages == null) return null;
        for (int i=messages.length()-1; i>=0; i--) {
            JSONObject m=messages.getJSONObject(i);
            if ("bot".equals(m.optString("role")) && "text".equals(m.optString("kind"))
                && !m.optBoolean("deleted") && !oldIds.contains(m.optString("id"))
                && !m.optString("text").trim().isEmpty()) return m.optString("text");
        }
        return null;
    }
}
