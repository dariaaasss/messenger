import os

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./messenger.db")

engine = create_async_engine(DATABASE_URL)
session_factory = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()


async def get_session():
    async with session_factory() as session:
        yield session


async def init_database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
