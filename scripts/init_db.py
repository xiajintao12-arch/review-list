"""连接 Supabase 数据库并执行建表 SQL
用法: python scripts/init_db.py <project_ref> <db_password> [region]
"""
import sys
import psycopg2

REGIONS = {
    'ap-southeast-1': 'aws-0-ap-southeast-1.pooler.supabase.com',
    'ap-northeast-2': 'aws-0-ap-northeast-2.pooler.supabase.com',
    'ap-northeast-1': 'aws-0-ap-northeast-1.pooler.supabase.com',
}

def main():
    ref = sys.argv[1]
    pwd = sys.argv[2]
    region = sys.argv[3] if len(sys.argv) > 3 else 'ap-southeast-1'
    host = REGIONS.get(region, REGIONS['ap-southeast-1'])

    sql = open('supabase/schema.sql', encoding='utf-8').read()
    conn = None
    last_err = None
    for port, user in ((5432, f'postgres.{ref}'), (6543, f'postgres.{ref}'), (5432, 'postgres')):
        try:
            conn = psycopg2.connect(host=host, port=port, user=user, password=pwd,
                                    dbname='postgres', sslmode='require', connect_timeout=20)
            print(f'connected via {host}:{port} user={user}')
            break
        except Exception as e:
            last_err = e
            print(f'  try {host}:{port} user={user} -> {str(e).strip()[:90]}')
    if conn is None:
        raise SystemExit('DB_CONNECT_FAILED: ' + str(last_err))

    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute(sql)
        conn.commit()
        print('DDL_OK')
        cur.execute("select table_name from information_schema.tables where table_schema='public' order by 1")
        print('tables:', [r[0] for r in cur.fetchall()])
    except Exception as e:
        conn.rollback()
        raise SystemExit('DDL_FAILED: ' + str(e))
    finally:
        cur.close()
        conn.close()

main()
