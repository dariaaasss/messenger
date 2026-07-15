import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import get_session
from app.models import User


router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "local-secret")
JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME_HOURS = 24


class Credentials(BaseModel):
    username: str
    password: str = Field(min_length=6, max_length=72)


def normalize_username(username):
    username = username.strip()
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(status_code=422, detail="логин должен содержать от 3 до 50 символов")
    return username


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id):
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_LIFETIME_HOURS)
    payload = {"sub": str(user_id), "exp": expires_at}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def authorization_error():
    return HTTPException(
        status_code=401,
        detail="требуется авторизация",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(credentials=Depends(security), session=Depends(get_session)):
    if credentials is None:
        raise authorization_error()

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise authorization_error()

    user = await session.get(User, user_id)
    if user is None:
        raise authorization_error()
    return user


@router.post("/register", status_code=201)
async def register(data: Credentials, session=Depends(get_session)):
    username = normalize_username(data.username)
    result = await session.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="пользователь с таким логином уже существует")

    user = User(username=username, password_hash=hash_password(data.password))
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return {"access_token": create_token(user.id), "token_type": "bearer"}


@router.post("/login")
async def login(data: Credentials, session=Depends(get_session)):
    username = normalize_username(data.username)
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="неверный логин или пароль")

    return {"access_token": create_token(user.id), "token_type": "bearer"}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"id": user.id, "username": user.username}
