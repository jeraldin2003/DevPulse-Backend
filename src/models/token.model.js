// In-memory token store
const refreshTokens = new Map();

export const saveRefreshToken = async (token, userId, expiresAt) => {
  const tokenData = { token, user_id: userId, expires_at: expiresAt };
  refreshTokens.set(token, tokenData);
  return tokenData;
};

export const findRefreshToken = async (token) => {
  return refreshTokens.get(token) || null;
};

export const deleteRefreshToken = async (token) => {
  const tokenData = refreshTokens.get(token);
  if (tokenData) {
    refreshTokens.delete(token);
    return tokenData;
  }
  return null;
};

export const deleteAllUserRefreshTokens = async (userId) => {
  const deletedTokens = [];
  for (const [token, data] of refreshTokens.entries()) {
    if (data.user_id === userId) {
      deletedTokens.push(data);
      refreshTokens.delete(token);
    }
  }
  return deletedTokens;
};
