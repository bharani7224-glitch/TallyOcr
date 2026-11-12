using TallyBridge.Server.Hubs;
using TallyBridge.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add Controllers, MemoryCache & SignalR
builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10MB
});

// HttpClient for Direct Tally access
builder.Services.AddHttpClient("TallyDirect", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

// Singletons
builder.Services.AddSingleton<IConnectorRegistry, ConnectorRegistry>();
builder.Services.AddSingleton<IVoucherDispatcher, VoucherDispatcher>();
builder.Services.AddSingleton<ITallyDiagnosticService, TallyDiagnosticService>();

// CORS for React UI
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();

app.MapGet("/", () => Results.Ok(new
{
    service = "TallyBridge Server",
    version = "1.0.0",
    status = "Healthy",
    timestamp = DateTime.UtcNow
}));

app.MapControllers();
app.MapHub<ConnectorHub>("/hubs/connector");

app.Run();
