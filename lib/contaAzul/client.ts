const API_BASE_URL = process.env.CONTA_AZUL_API_BASE_URL;

export async function contaAzulFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!API_BASE_URL) {
    throw new Error("Variável ausente: CONTA_AZUL_API_BASE_URL");
  }

  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new Error("Token inválido ou expirado. Renove o token e tente novamente.");
  }

  return response;
}
