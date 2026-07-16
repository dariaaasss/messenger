# Messenger

Мессенджер на FastAPI и SQLAlchemy.

## Локальный запуск

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export JWT_SECRET=replace-with-a-long-random-string
uvicorn app.main:app --reload
```

После запуска приложение будет доступно по адресу `http://127.0.0.1:8000`.

## Демо-данные

```bash
python -m app.seed
```

Скрипт создаёт пользователей `daria`, `alex` и `maria`. Пароль для всех: `demo123`.

По умолчанию используется SQLite. Для PostgreSQL нужно запустить базу из `compose.yml` и задать переменную:

```bash
export DATABASE_URL=postgresql+asyncpg://messenger:messenger@localhost:5432/messenger
```

Документация API: `http://127.0.0.1:8000/docs`.
