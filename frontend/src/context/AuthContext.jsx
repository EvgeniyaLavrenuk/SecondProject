import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import http, { getToken, setToken, removeToken, setUnauthorizedHandler } from '../api/http';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // пока проверяется сохраненный токен, страницы не показываются
  const [checking, setChecking] = useState(true);

  const clear = useCallback(() => {
    removeToken();
    setUser(null);
  }, []);

  // при открытии сайта сохраненный токен проверяется на сервере
  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (!getToken()) {
      setChecking(false);
      return;
    }
    http.get('/auth/me')
      .then((response) => setUser(response.data.user))
      .catch(() => clear())
      .finally(() => setChecking(false));
  }, [clear]);

  const login = async (email, password) => {
    const response = await http.post('/auth/login', { email, password });
    setToken(response.data.token);
    setUser(response.data.user);
    return response.data.user;
  };

  const register = async (data) => {
    const response = await http.post('/auth/register', data);
    setToken(response.data.token);
    setUser(response.data.user);
    return response.data.user;
  };

  // выход: сессия отзывается на сервере, токен удаляется из браузера
  const logout = async () => {
    try {
      await http.post('/auth/logout');
    } catch {
      // даже если сервер недоступен, локальный выход выполняется
    }
    clear();
  };

  return (
    <AuthContext.Provider value={{ user, checking, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
