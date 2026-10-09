package app.diza.live.voice;

/** Platform-independent voice turn state machine. Not a synthetic chat model. */
public final class VoiceCycle {
    public enum State { STOPPED, LISTENING, WAITING, SPEAKING }
    private State state = State.STOPPED;
    private int completed = 0;
    private int accepted = 0;

    public synchronized boolean begin() {
        if (state != State.STOPPED) return false;
        state = State.LISTENING;
        return true;
    }
    public synchronized boolean heard(String text) {
        if (state != State.LISTENING || text == null || text.trim().isEmpty()) return false;
        accepted++;
        state = State.WAITING;
        return true;
    }
    public synchronized boolean answered(String text) {
        if (state != State.WAITING || text == null || text.trim().isEmpty()) return false;
        state = State.SPEAKING;
        return true;
    }
    public synchronized boolean speechEnded() {
        if (state != State.SPEAKING) return false;
        completed++;
        state = State.LISTENING;
        return true;
    }
    public synchronized void stop() { state = State.STOPPED; }
    public synchronized State state() { return state; }
    public synchronized int turnsCompleted() { return completed; }
    public synchronized int turnsAccepted() { return accepted; }
}
