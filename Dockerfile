# Multi-stage Dockerfile for TallyBridge.Server (.NET 8.0)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project files and restore
COPY TallyBridge-connector/src/TallyBridge.Contracts/TallyBridge.Contracts.csproj TallyBridge.Contracts/
COPY TallyBridge-connector/src/TallyBridge.Server/TallyBridge.Server.csproj TallyBridge.Server/
RUN dotnet restore TallyBridge.Server/TallyBridge.Server.csproj

# Copy source and publish
COPY TallyBridge-connector/src/TallyBridge.Contracts/ TallyBridge.Contracts/
COPY TallyBridge-connector/src/TallyBridge.Server/ TallyBridge.Server/
WORKDIR /src/TallyBridge.Server
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Configure port binding for cloud hosts (Render, Railway, Fly.io)
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "TallyBridge.Server.dll"]
