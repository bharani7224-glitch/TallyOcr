using System.Diagnostics;
namespace TallyBridge.Connector.Tally;
public static class TallyProcess
{
    static readonly string[] Names = ["TallyPrime", "Tally"];
    public static bool IsRunning()
    {
        foreach (var n in Names)
        {
            var ps = Process.GetProcessesByName(n);
            var found = ps.Length > 0;
            foreach (var p in ps) p.Dispose();
            if (found) return true;
        }
        return false;
    }
}
