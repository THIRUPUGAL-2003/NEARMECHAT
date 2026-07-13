import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_7UmdDhf4gJWw@ep-restless-butterfly-atmz9e7n-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

async def init_db():
    print(f"Connecting to {DATABASE_URL} ...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("Creating tables...")
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                email VARCHAR UNIQUE NOT NULL,
                password_hash VARCHAR NOT NULL,
                location VARCHAR,
                bio TEXT,
                lat DOUBLE PRECISION,
                lng DOUBLE PRECISION,
                is_online BOOLEAN DEFAULT FALSE,
                profile_pic VARCHAR,
                is_blocked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_text TEXT,
                media_url VARCHAR,
                media_type VARCHAR,
                voice_duration INTEGER DEFAULT 0,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                caption TEXT,
                media_url VARCHAR,
                media_type VARCHAR,
                likes_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS post_likes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (post_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                text TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS user_likes (
                id SERIAL PRIMARY KEY,
                liker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                liked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_like BOOLEAN NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (liker_id, liked_id)
            );

            CREATE TABLE IF NOT EXISTS stories (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                text TEXT,
                bg_color VARCHAR,
                media_url VARCHAR,
                media_type VARCHAR,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS follows (
                id SERIAL PRIMARY KEY,
                follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                followed_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (follower_id, followed_id)
            );
        ''')
        print("Tables created successfully!")
    except Exception as e:
        print(f"Error creating tables: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(init_db())
