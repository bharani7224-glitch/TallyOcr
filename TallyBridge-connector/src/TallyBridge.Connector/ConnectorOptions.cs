namespace TallyBridge.Connector;
public sealed class ConnectorOptions
{
    public string HubUrl { get; set; } = "";
    public string TallyUrl { get; set; } = "http://127.0.0.1:9000";
    public string? DevKey { get; set; }          // development only; production reads the DPAPI-protected key
    public int RequestTimeoutSeconds { get; set; } = 45;
    public int StateIntervalSeconds { get; set; } = 20;
}
