using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using TallyBridge.Contracts;
using TallyBridge.Server.Models;
using TallyBridge.Server.Services;

namespace TallyBridge.Server.Hubs;

public sealed class ConnectorHub : Hub
{
    private readonly IConnectorRegistry _registry;
    private readonly IVoucherDispatcher _dispatcher;
    private readonly ILogger<ConnectorHub> _logger;

    public ConnectorHub(
        IConnectorRegistry registry,
        IVoucherDispatcher dispatcher,
        ILogger<ConnectorHub> logger)
    {
        _registry = registry;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public override Task OnConnectedAsync()
    {
        var httpContext = Context.GetHttpContext();
        var key = httpContext?.Request.Headers["X-Connector-Key"].FirstOrDefault();
        var deviceId = httpContext?.Request.Headers["X-Device-Id"].FirstOrDefault() ?? Context.ConnectionId;

        _logger.LogInformation("Connector connected: ConnectionId={ConnectionId}, DeviceId={DeviceId}",
            Context.ConnectionId, deviceId);

        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Connector disconnected: ConnectionId={ConnectionId}", Context.ConnectionId);
        _registry.Unregister(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    [HubMethodName(HubMethods.UpdateState)]
    public Task UpdateState(string payload)
    {
        try
        {
            var state = JsonSerializer.Deserialize<ConnectorStatePayload>(payload);
            if (state != null)
            {
                var company = !string.IsNullOrWhiteSpace(state.CompanyName) ? state.CompanyName : state.Company;
                var list = state.Companies ?? new List<string>();
                if (!string.IsNullOrWhiteSpace(company) && !list.Contains(company, StringComparer.OrdinalIgnoreCase))
                {
                    list.Insert(0, company);
                }

                _registry.RegisterOrUpdate(
                    Context.ConnectionId,
                    state.DeviceId ?? Context.ConnectionId,
                    company,
                    list,
                    state.TallyRunning,
                    state.TallyReachable);

                _logger.LogInformation(
                    "Connector state updated: ConnectionId={ConnectionId}, Reachable={Reachable}, Companies=[{Companies}]",
                    Context.ConnectionId, state.TallyReachable, string.Join(", ", list));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse connector state update from {ConnectionId}", Context.ConnectionId);
        }

        return Task.CompletedTask;
    }

    [HubMethodName(HubMethods.VoucherResult)]
    public Task HandleVoucherResult(string correlationId, string statusStr, string message)
    {
        if (Enum.TryParse<VoucherStatus>(statusStr, true, out var status))
        {
            _dispatcher.CompleteVoucher(correlationId, new VoucherResult(correlationId, status, message));
        }
        else
        {
            _dispatcher.CompleteVoucher(correlationId, new VoucherResult(correlationId, VoucherStatus.Unknown, message));
        }

        return Task.CompletedTask;
    }
}

