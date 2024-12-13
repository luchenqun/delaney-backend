-- 数据表命名规范
-- 采用26个英文字母(区分大小写)和0-9的自然数(经常不需要)加上下划线''组成，命名简洁明确，多个单词用下划线''分隔
-- 全部小写命名，禁止出现大写
-- 禁止使用数据库关键字，如：name，time ，datetime，password等
-- 表名称不应该取得太长（一般不超过三个英文单词）
-- 表的名称一般使用名词或者动宾短语
-- 用单数形式表示名称，例如，使用 employee，而不是 employees
-- 表必须填写描述信息（使用SQL语句建表时）
-----------------------------------
-- 字段命名规范
-- 采用26个英文字母(区分大小写)和0-9的自然数(经常不需要)加上下划线''组成，命名简洁明确，多个单词用下划线''分隔
-- 全部小写命名，禁止出现大写
-- 字段必须填写描述信息
-- 禁止使用数据库关键字，如：name，time ，datetime password 等
-- 字段名称一般采用名词或动宾短语
-- 采用字段的名称必须是易于理解，一般不超过三个英文单词
-- 在命名表的列时，不要重复表的名称
-- 不要在列的名称中包含关键字类型
-- 字段命名使用完整名称，禁止缩写
-----------------------------------
-- 用户表
CREATE TABLE
  IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    address CHAR(42) UNIQUE NOT NULL,
    parent CHAR(42) DEFAULT "",
    depth INT NOT NULL DEFAULT 0,
    star INT NOT NULL DEFAULT 0,
    min_star INT NOT NULL DEFAULT 0,
    mud CHAR(64) NOT NULL DEFAULT "0",
    usdt CHAR(64) NOT NULL DEFAULT "0",
    sub_person INT NOT NULL DEFAULT 0,
    sub_mud CHAR(64) NOT NULL DEFAULT "0",
    sub_usdt CHAR(64) NOT NULL DEFAULT "0",
    team_person INT NOT NULL DEFAULT 0,
    team_mud CHAR(64) NOT NULL DEFAULT "0",
    team_usdt CHAR(64) NOT NULL DEFAULT "0",
    ref VARCHAR(6) UNIQUE NOT NULL DEFAULT "",
    parent_ref VARCHAR(6) NOT NULL DEFAULT "",
    create_time INTEGER NOT NULL DEFAULT (strftime ('%s', 'now'))
  );

INSERT
OR IGNORE INTO user (address, parent, depth, ref)
VALUES
  (
    '0x00000be6819f41400225702d32d3dd23663dd690',
    '0x0000000000000000000000000000000000000000',
    1,
    '888888'
  );

-- 质押表
CREATE TABLE
  IF NOT EXISTS delegate (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    cid INT NOT NULL DEFAULT -1, -- 合约上面的id，要根据id到期领取本金
    address CHAR(42) NOT NULL,
    mud CHAR(64) NOT NULL DEFAULT "0",
    min_usdt CHAR(64) NOT NULL DEFAULT "0",
    usdt CHAR(64) NOT NULL DEFAULT "0",
    back_min_mud CHAR(64) NOT NULL DEFAULT "0",
    back_mud CHAR(64) NOT NULL DEFAULT "0",
    hash CHAR(66) UNIQUE NOT NULL,
    undelegate_hash CHAR(66) NOT NULL DEFAULT "0x0000000000000000000000000000000000000000000000000000000000000000",
    period_duration INT NOT NULL DEFAULT 0,
    period_num INT NOT NULL DEFAULT 0,
    period_reward_ratio INT NOT NULL DEFAULT 0,
    status INT NOT NULL DEFAULT 0,
    unlock_time INTEGER DEFAULT 0,
    undelegate_time INTEGER DEFAULT 0,
    create_time INTEGER NOT NULL DEFAULT (strftime ('%s', 'now'))
  );

-- 动态奖励
CREATE TABLE
  IF NOT EXISTS dynamic_reward (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    delegate_id INT NOT NULL,
    delegator CHAR(42) NOT NULL,
    claim_id INT NOT NULL DEFAULT -1,
    address CHAR(42) NOT NULL,
    usdt CHAR(64) NOT NULL DEFAULT "0",
    type INT NOT NULL DEFAULT 0,
    hash CHAR(66) NOT NULL DEFAULT "0x0000000000000000000000000000000000000000000000000000000000000000",
    status INT NOT NULL DEFAULT 0,
    claim_time INTEGER DEFAULT 0,
    create_time INTEGER NOT NULL DEFAULT (strftime ('%s', 'now'))
  );

-- 静态奖励
CREATE TABLE
  IF NOT EXISTS static_reward (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    delegate_id INT NOT NULL,
    claim_id INT NOT NULL DEFAULT -1,
    period INT NOT NULL,
    address CHAR(42) NOT NULL,
    usdt CHAR(64) NOT NULL DEFAULT "0",
    hash CHAR(66) NOT NULL DEFAULT "0x0000000000000000000000000000000000000000000000000000000000000000",
    status INT NOT NULL DEFAULT 0,
    unlock_time INTEGER NOT NULL,
    claim_time INTEGER DEFAULT 0,
    create_time INTEGER NOT NULL DEFAULT (strftime ('%s', 'now'))
  );

-- 领取奖励
CREATE TABLE
  IF NOT EXISTS claim (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    cid INT NOT NULL DEFAULT -1,
    address CHAR(42) NOT NULL,
    usdt CHAR(64) NOT NULL DEFAULT "0",
    min_mud CHAR(64) NOT NULL DEFAULT "0",
    mud CHAR(64) NOT NULL DEFAULT "0",
    reward_ids VARCHAR(2048) NOT NULL,
    hash CHAR(66) NOT NULL DEFAULT "0x0000000000000000000000000000000000000000000000000000000000000000",
    status INT NOT NULL DEFAULT 0,
    signature CHAR(132) UNIQUE NOT NULL DEFAULT "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    claim_time INTEGER DEFAULT 0,
    deadline INTEGER NOT NULL,
    create_time INTEGER NOT NULL DEFAULT (strftime ('%s', 'now'))
  );

-- 消息
CREATE TABLE
  IF NOT EXISTS message (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    address CHAR(42) NOT NULL,
    type INT NOT NULL DEFAULT 0,
    title VARCHAR(128) NOT NULL,
    content VARCHAR(2048) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    create_time INTEGER NOT NULL DEFAULT (strftime ('%s', 'now'))
  );