using System.Collections.Concurrent;

namespace TallyBridge.Server.Services;

public sealed record ConnectorClientSession(
    string ConnectionId,
    string DeviceId,
    string? PrimaryCompany,
    List<string> Companies,
    bool TallyRunning,
    bool TallyReachable,
    DateTime ConnectedAt,
    DateTime LastSeen);

public interface IConnectorRegistry
{
    void RegisterOrUpdate(string connectionId, string deviceId, string? primaryCompany, List<string> companies, bool tallyRunning, bool tallyReachable);
    void Unregister(string connectionId);
    IReadOnlyList<ConnectorClientSession> GetAllConnectors();
    ConnectorClientSession? FindByCompany(string? companyName);
    bool HasActiveConnector(string? companyName = null);
    List<string> GetActiveCompanies();
}

public sealed class ConnectorRegistry : IConnectorRegistry
{
    private readonly ConcurrentDictionary<string, ConnectorClientSession> _sessions = new(StringComparer.OrdinalIgnoreCase);

    public void RegisterOrUpdate(
        string connectionId,
        string deviceId,
        string? primaryCompany,
        List<string> companies,
        bool tallyRunning,
        bool tallyReachable)
    {
        var now = DateTime.UtcNow;
        _sessions.AddOrUpdate(
            connectionId,
            id => new ConnectorClientSession(
                id,
                deviceId,
                primaryCompany,
                companies ?? new List<string>(),
                tallyRunning,
                tallyReachable,
                now,
                now),
            (id, existing) => new ConnectorClientSession(
                id,
                deviceId,
                primaryCompany ?? existing.PrimaryCompany,
                companies ?? existing.Companies,
                tallyRunning,
                tallyReachable,
                existing.ConnectedAt,
                now));
    }

    public void Unregister(string connectionId)
    {
        _sessions.TryRemove(connectionId, out _);
    }

    public IReadOnlyList<ConnectorClientSession> GetAllConnectors()
    {
        return _sessions.Values.ToList();
    }

    public ConnectorClientSession? FindByCompany(string? companyName)
    {
        if (string.IsNullOrWhiteSpace(companyName))
        {
            return _sessions.Values.FirstOrDefault(c => c.TallyReachable && c.Companies.Count > 0);
        }

        return _sessions.Values.FirstOrDefault(c =>
            c.TallyReachable &&
            (string.Equals(c.PrimaryCompany, companyName, StringComparison.OrdinalIgnoreCase) ||
             c.Companies.Any(comp => string.Equals(comp, companyName, StringComparison.OrdinalIgnoreCase))));
    }

    public bool HasActiveConnector(string? companyName = null)
    {
        return FindByCompany(companyName) != null;
    }

    public List<string> GetActiveCompanies()
    {
        return _sessions.Values
            .Where(c => c.TallyReachable)
            .SelectMany(c => c.Companies)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}

