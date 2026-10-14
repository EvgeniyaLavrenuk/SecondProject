import axios from 'axios';

const TOKEN_KEY = 'zachio_token';

// адрес бэкенда берется из файла .env (VITE_API_URL)
const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
});

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

// к каждому запросу добавляется токен из localStorage
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// при ответе 401 (токен истек или сессия завершена) пользователь выходит из системы
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login') && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

// текст ошибки для показа пользователю
export const errorText = (error) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ERR_NETWORK') return 'Нет связи с сервером. Проверьте, что бэкенд запущен';
  return 'Что-то пошло не так. Попробуйте еще раз';
};

export default http;
