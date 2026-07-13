import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_KBw71qDZFiGe@ep-square-firefly-aqg83vvk-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

async def check_db():
    print(f"Connecting to {DATABASE_URL} ...")
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("Connected!")
        tables = await conn.fetch('''
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        ''')
        print("Tables in database:")
        for t in tables:
            print(f"- {t['table_name']}")
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
