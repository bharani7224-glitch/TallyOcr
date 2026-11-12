using Microsoft.Extensions.Options;
using TallyBridge.Connector;
using TallyBridge.Connector.Handlers;
using TallyBridge.Connector.Security;
using TallyBridge.Connector.Tally;
using TallyBridge.Connector.Workers;

// Installer hook: TallyBridge.Connector.exe --set-key <secret>   (stores DPAPI-encrypted key)
var i = Array.IndexOf(args, "--set-key");
if (i >= 0 && i + 1 < args.Length) { SecretStore.Store(args[i + 1]); return; }

var b = Host.CreateApplicationBuilder(args);
b.Services.AddWindowsService(o => o.ServiceName = "TallyBridge Connector");
b.Services.Configure<ConnectorOptions>(b.Configuration.GetSection("Connector"));
b.Services.AddSingleton<SecretStore>();
b.Services.AddHttpClient<TallyClient>((sp, c) =>
{
    var url = new Uri(sp.GetRequiredService<IOptions<ConnectorOptions>>().Value.TallyUrl);
    if (!url.IsLoopback) throw new InvalidOperationException("Tally must be reached on localhost only.");
    c.BaseAddress = url;
    c.Timeout = TimeSpan.FromSeconds(sp.GetRequiredService<IOptions<ConnectorOptions>>().Value.RequestTimeoutSeconds);
});
b.Services.AddSingleton<VoucherHandler>();
b.Services.AddHostedService<HubWorker>();
await b.Build().RunAsync();
