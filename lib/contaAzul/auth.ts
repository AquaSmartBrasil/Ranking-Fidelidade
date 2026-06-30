export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export function buildAuthorizationUrl(state: string): string {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI;
  const authUrl = process.env.CONTA_AZUL_AUTH_URL;

  if (!clientId) throw new Error("Variável ausente: CONTA_AZUL_CLIENT_ID");
  if (!redirectUri) throw new Error("Variável ausente: CONTA_AZUL_REDIRECT_URI");
  if (!authUrl) throw new Error("Variável ausente: CONTA_AZUL_AUTH_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile aws.cognito.signin.user.admin",
    state,
  });

  return `${authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
  const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI;
  const tokenUrl = process.env.CONTA_AZUL_TOKEN_URL;

  if (!clientId) throw new Error("Variável ausente: CONTA_AZUL_CLIENT_ID");
  if (!clientSecret) throw new Error("Variável ausente: CONTA_AZUL_CLIENT_SECRET");
  if (!redirectUri) throw new Error("Variável ausente: CONTA_AZUL_REDIRECT_URI");
  if (!tokenUrl) throw new Error("Variável ausente: CONTA_AZUL_TOKEN_URL");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao trocar code por token: ${response.status} — ${text}`);
  }

  return response.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
  const tokenUrl = process.env.CONTA_AZUL_TOKEN_URL;

  if (!clientId) throw new Error("Variável ausente: CONTA_AZUL_CLIENT_ID");
  if (!clientSecret) throw new Error("Variável ausente: CONTA_AZUL_CLIENT_SECRET");
  if (!tokenUrl) throw new Error("Variável ausente: CONTA_AZUL_TOKEN_URL");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao renovar token: ${response.status} — ${text}`);
  }

  return response.json() as Promise<TokenResponse>;
}
