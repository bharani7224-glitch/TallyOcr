using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.Win32;

namespace TallyBridge.Connector.Security;

/// <summary>Connector key + device id live in HKLM\SOFTWARE\TallyBridge (key is DPAPI machine-scope encrypted). No invoice data.</summary>
public sealed class SecretStore(IOptions<ConnectorOptions> opt)
{
    const string Path = @"SOFTWARE\TallyBridge";

    public string GetKey()
    {
        if (OperatingSystem.IsWindows())
        {
            using var k = Registry.LocalMachine.OpenSubKey(Path);
            if (k?.GetValue("Key") is byte[] blob)
                return Encoding.UTF8.GetString(ProtectedData.Unprotect(blob, null, DataProtectionScope.LocalMachine));
        }
        return opt.Value.DevKey ?? string.Empty;
    }

    public string GetDeviceId()
    {
        if (!OperatingSystem.IsWindows()) return Environment.MachineName;
        try
        {
            using var k = Registry.LocalMachine.CreateSubKey(Path);
            if (k.GetValue("DeviceId") is string id && id.Length > 0) return id;
            id = Guid.NewGuid().ToString("N");
            k.SetValue("DeviceId", id);
            return id;
        }
        catch (UnauthorizedAccessException)
        {
            try
            {
                using var userKey = Registry.CurrentUser.CreateSubKey(Path);
                if (userKey.GetValue("DeviceId") is string userId && userId.Length > 0) return userId;
                userId = Guid.NewGuid().ToString("N");
                userKey.SetValue("DeviceId", userId);
                return userId;
            }
            catch
            {
                return Environment.MachineName;
            }
        }
    }

    public static void Store(string key)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        using var k = Registry.LocalMachine.CreateSubKey(Path);
        k.SetValue("Key", ProtectedData.Protect(Encoding.UTF8.GetBytes(key), null, DataProtectionScope.LocalMachine), RegistryValueKind.Binary);
    }
}
