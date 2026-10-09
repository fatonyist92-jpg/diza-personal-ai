import app.diza.live.voice.VoiceCycle;

/** Executable on JDK without Android SDK. Validates turn state logic only. */
public class VoiceCycleTest {
    static void yes(boolean value, String description) {
        if (!value) throw new AssertionError(description);
    }
    public static void main(String[] args) {
        VoiceCycle call = new VoiceCycle();
        yes(call.begin(), "begin call");
        for (int i = 1; i <= 10; i++) {
            yes(call.state() == VoiceCycle.State.LISTENING, "must listen for turn " + i);
            yes(!call.heard(""), "empty audio transcript must not dispatch");
            yes(call.heard("halo putaran " + i), "must accept user transcript");
            yes(!call.heard("replayed result"), "must reject duplicate transcript");
            yes(call.state() == VoiceCycle.State.WAITING, "must await Bloks response");
            yes(call.answered("jawaban Bloks " + i), "must accept reply text");
            yes(call.state() == VoiceCycle.State.SPEAKING, "must speak");
            yes(!call.answered("duplicate"), "must reject duplicate reply");
            yes(call.speechEnded(), "must resume listening");
            yes(!call.speechEnded(), "must reject duplicate speech end");
        }
        yes(call.turnsCompleted() == 10 && call.turnsAccepted() == 10, "10 successful turns");
        call.stop();
        yes(!call.heard("late callback"), "stopped call discards late callback");
        yes(call.begin(), "can start new call after hangup");
        System.out.println("PASS 10 sequential voice turn state transitions");
        System.out.println("PASS duplicate/empty/late events rejected");
    }
}
