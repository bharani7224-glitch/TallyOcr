using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.Options;
using TallyBridge.Connector.Handlers;
using TallyBridge.Connector.Security;
using TallyBridge.Connector.Tally;
using TallyBridge.Contracts;

namespace TallyBridge.Connector.Workers;

public sealed class HubWorker(IOptions<ConnectorOptions> opt, SecretStore secrets, TallyClient tally,
    VoucherHandler handler, ILogger<HubWorker> log) : BackgroundService
{
    sealed class ForeverRetry : IRetryPolicy
    {   // 1s,2s,4s,8s,16s then every 30s, forever
        public TimeSpan? NextRetryDelay(RetryContext c) => TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Min(c.PreviousRetryCount, 5))));
    }

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        var o = opt.Value;
        var key = secrets.GetKey();
        var device = secrets.GetDeviceId();

        var hub = new HubConnectionBuilder()
            .WithUrl(o.HubUrl, h =>
            {
                h.Headers["X-Connector-Key"] = key;
                h.Headers["X-Device-Id"] = device;
                h.AccessTokenProvider = () => Task.FromResult<string?>(key);
            })
            .WithAutomaticReconnect(new ForeverRetry())
            .Build();

        CancellationTokenSource Timeout()
        { var c = CancellationTokenSource.CreateLinkedTokenSource(stop); c.CancelAfter(TimeSpan.FromSeconds(o.RequestTimeoutSeconds + 15)); return c; }

        hub.On<VoucherRequest, VoucherResult>(HubMethods.CreateVoucher, async r =>
        {
            using var c = Timeout();
            var res = await handler.CreateAsync(r, c.Token);
            try { await hub.SendAsync(HubMethods.VoucherResult, res.CorrelationId, res.Status.ToString(), res.Message, c.Token); } catch { }
            return res;
        });
        hub.On<VoucherRequest, VoucherResult>(HubMethods.VerifyVoucher, async r => { using var c = Timeout(); return await handler.VerifyAsync(r, c.Token); });
        hub.On<string, List<string>>(HubMethods.GetLedgers, async co => { using var c = Timeout(); return await handler.LedgersAsync(co, c.Token); });
        hub.Reconnected += _ => PushState(hub, device, stop);   // re-register after any drop
        hub.Closed += ex => { log.LogWarning("Hub connection closed: {Error}", ex?.Message ?? "Server closed connection"); return Task.CompletedTask; };

        while (!stop.IsCancellationRequested)
        {
            try
            {
                if (hub.State == HubConnectionState.Disconnected)
                {
                    await hub.StartAsync(stop);
                    log.LogInformation("Successfully connected to Cloud Hub at {HubUrl}", o.HubUrl);
                }
                if (hub.State == HubConnectionState.Connected)
                {
                    await PushState(hub, device, stop);
                    log.LogInformation("State updated to cloud. DeviceId: {Device}", device);
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex) { log.LogWarning("Cloud connection problem: {Message}", ex.Message); }

            var wait = hub.State == HubConnectionState.Connected ? o.StateIntervalSeconds : 5;
            try { await Task.Delay(TimeSpan.FromSeconds(wait), stop); } catch (OperationCanceledException) { break; }
        }
        await hub.DisposeAsync();
    }

    async Task PushState(HubConnection hub, string device, CancellationToken ct)
    {
        var running = TallyProcess.IsRunning();
        var reachable = false; var companies = new List<string>();
        if (running)
        {
            try { using var c = CancellationTokenSource.CreateLinkedTokenSource(ct); c.CancelAfter(10_000); companies = await tally.GetCompaniesAsync(c.Token); reachable = true; }
            catch { /* Tally busy, HTTP server off, or no company open: reported as not reachable */ }
        }
        var payload = System.Text.Json.JsonSerializer.Serialize(new
        {
            company = companies.FirstOrDefault() ?? string.Empty,
            companyName = companies.FirstOrDefault() ?? string.Empty,
            deviceId = device,
            tallyRunning = running,
            tallyReachable = reachable,
            companies
        });
        await hub.InvokeAsync(HubMethods.UpdateState, payload, ct);
    }
}
