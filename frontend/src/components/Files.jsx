import { useRef, useState } from 'react';
import http, { errorText } from '../api/http';

const MAX_SIZE = 10 * 1024 * 1024;

// размер файла в удобном виде
export const fileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

// чтение файла в base64 (для отправки на сервер в JSON)
const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      data: String(reader.result).split(',')[1] || ''
    });
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

// Выбор файлов: files - массив { name, type, size, data }
export function FilePicker({ files, onChange, multiple = false, label = 'Прикрепить файл' }) {
  const input = useRef(null);
  const [error, setError] = useState('');

  const choose = async (event) => {
    setError('');
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    const tooBig = chosen.find((file) => file.size > MAX_SIZE);
    if (tooBig) {
      setError(`Файл «${tooBig.name}» больше 10 МБ`);
      return;
    }
    const empty = chosen.find((file) => file.size === 0);
    if (empty) {
      setError(`Файл «${empty.name}» пустой`);
      return;
    }
    try {
      const read = await Promise.all(chosen.map(readFile));
      onChange(multiple ? [...files, ...read] : read.slice(0, 1));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="file-picker">
      <input ref={input} type="file" multiple={multiple} onChange={choose} hidden />
      <button type="button" className="btn btn-light btn-small" onClick={() => input.current.click()}>
        📎 {label}
      </button>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>📄 {file.name} <span className="muted">({fileSize(file.size)})</span></span>
              <button
                type="button"
                className="link-btn danger"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                убрать
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

// Ссылка на скачивание файла с сервера (запрос идет с токеном)
export function FileLink({ file }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      const response = await http.get(`/files/${file.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      // ответ с ошибкой приходит как blob - текст достается из него
      if (err.response?.data instanceof Blob) {
        try {
          const data = JSON.parse(await err.response.data.text());
          setError(data.message || 'Не удалось скачать файл');
        } catch {
          setError('Не удалось скачать файл');
        }
      } else {
        setError(errorText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="file-link-wrap">
      <button type="button" className="file-link" onClick={download} disabled={busy}>
        📄 {file.name}{file.size ? <span className="muted"> · {fileSize(file.size)}</span> : null}
      </button>
      {error && <span className="field-error inline">{error}</span>}
    </span>
  );
}
