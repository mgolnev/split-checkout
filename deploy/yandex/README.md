# Первый деплой в Yandex Cloud (пошагово)

Предполагается: проект уже собирается локально (`npm run build`), **Docker Desktop запущен** на вашем компьютере. В облаке создаём: **PostgreSQL** → **Container Registry** → публикуем образ → запускаем контейнер (**проще всего — на виртуальной машине**).

Официальная документация: [cloud.yandex.ru/docs](https://cloud.yandex.ru/docs).

---

## 0. Что будет в конце

| Компонент | Зачем |
|-----------|--------|
| **Managed PostgreSQL** | База для Prisma |
| **Container Registry** | Хранение Docker-образа приложения |
| **Виртуальная машина (Compute)** | Запуск контейнера с сайтом (проще для первого раза, чем Serverless + API Gateway) |

Переменные, которые понадобятся в контейнере:

- `DATABASE_URL` — строка подключения к PostgreSQL  
- `ADMIN_PASSWORD` — пароль входа в `/admin` на сайте  

---

## 1. Регистрация и облако

1. Зайдите на [console.cloud.yandex.ru](https://console.cloud.yandex.ru).
2. Войдите аккаунтом Яндекс. Если облака ещё нет — создайте **облако** (Cloud) и привяжите **платёжный аккаунт** (часто дают пробный период / грант — смотрите условия на сайте).
3. Откройте или создайте **каталог** (Folder), например `default` — в нём будут все ресурсы.

Запомните **ID каталога** (в интерфейсе обычно виден в настройках каталога или в строке URL) — он понадобится для CLI, если будете им пользоваться.

---

## 2. Кластер PostgreSQL

1. В меню слева: **Managed Service for PostgreSQL** (или через поиск «PostgreSQL»).
2. **Создать кластер**.
3. Укажите:
   - **имя кластера** (любое, например `split-checkout-pg`);
   - **окружение** — `PRODUCTION` или `PRESTABLE` (для теста можно минимальную конфигурацию);
   - **версия PostgreSQL** — подходящая под Prisma (например 15 или 16);
   - **сеть** — чаще всего **создать новую** или выбрать **default** в каталоге;
   - **хосты** — достаточно 1 хоста для старта;
   - **пользователь** и **пароль** администратора — **сохраните пароль** (потеряли — сброс через консоль).

4. **База данных**: при создании кластера задаётся имя БД (например `splitcheckout`) или используется стандартное — смотрите в карточке кластера после создания.

5. **Доступ с вашего компьютера** (чтобы выполнить `prisma migrate` с ноутбука):
   - В настройках кластера найдите раздел про **сеть / доступ** (формулировки вроде «публичный доступ к хостам», «доступ из интернета»).
   - Включите доступ, если миграции будете гонять **не** из той же сети VPC, а с домашнего интернета.
   - Либо настройте **группу безопасности** (Security Group): разрешить входящий TCP **6432** (или порт из карточки хоста) **с вашего текущего IP** (узнать IP: поиск «my ip» в браузере). Вариант «открыть всему интернету» (`0.0.0.0/0`) — только для краткого теста, не для продакшена.

6. После создания откройте кластер → вкладка **Обзор** / **Подключение**:
   - **FQDN хоста** (вида `rc1a-xxxxx.mdb.yandexcloud.net` или `c-xxxxx.rw.mdb.yandexcloud.net` — в консоли показывают актуально);
   - **порт** — у Managed PostgreSQL в Yandex чаще **6432** (проверьте в инструкции к кластеру);
   - **имя пользователя** и **имя БД**.

7. Соберите строку для Prisma (подставьте свои значения; спецсимволы в пароле — в URL-кодировке, например `#` → `%23`):

   ```text
   postgresql://<пользователь>:<пароль>@<FQDN>:6432/<имя_базы>?sslmode=require
   ```

Проверка с ноутбука (если установлен `psql`):

```bash
psql "postgresql://USER:PASSWORD@HOST:6432/DBNAME?sslmode=require" -c 'select 1'
```

Если не подключается — смотрите раздел «Частые проблемы» внизу.

---

## 3. Миграции Prisma на эту базу (с вашего ПК)

В корне репозитория:

```bash
cd /путь/к/checkout
export DATABASE_URL="postgresql://..."
npm run db:migrate:deploy
```

При необходимости затем засеять данные (опционально):

```bash
DATABASE_URL="postgresql://..." npm run db:seed
```

---

## 4. Установка Yandex Cloud CLI (по желанию, но удобно)

На Mac (Homebrew):

```bash
brew install yandex-cloud-cli
```

Или [инструкция для всех ОС](https://cloud.yandex.ru/docs/cli/quickstart).

Инициализация:

```bash
yc init
```

Войдите в браузере, выберите облако и каталог. После этого команды `yc` будут знать контекст.

---

## 5. Container Registry и загрузка образа

### 5.1. Создать реестр

- В консоли: **Container Registry** → **Создать реестр** → имя, например `split-checkout`.
- Либо через CLI:

  ```bash
  yc container registry create --name split-checkout
  yc container registry list
  ```

Запомните **ID реестра** (поле `id` в выводе).

### 5.2. Настроить Docker для входа в `cr.yandex`

```bash
yc container registry configure-docker
```

### 5.3. Собрать и отправить образ (на вашем ПК, в каталоге проекта)

```bash
npm run docker:build
docker tag split-checkout:latest cr.yandex/<ID_РЕЕСТРА>/split-checkout:latest
docker push cr.yandex/<ID_РЕЕСТРА>/split-checkout:latest
```

Дождитесь успешного окончания `docker push`.

---

## 6. Запуск: виртуальная машина с Docker (рекомендуемый первый вариант)

### 6.1. Создать сервисный аккаунт и ключ для `docker pull` (образ в приватном реестре)

1. **IAM** → **Сервисные аккаунты** → **Создать**: имя, например `registry-puller`.
2. Роль: **`container-registry.images.puller`** на ваш реестр (или на каталог — по политике безопасности).
3. **Создать статический ключ доступа** (JSON) и **сохраните файл** — он нужен один раз для `docker login` на ВМ.

### 6.2. Создать ВМ

1. **Compute Cloud** → **Виртуальные машины** → **Создать ВМ**.
2. Образ: **Ubuntu 22.04 LTS** (или новее).
3. Зона — та же, что у реестра/кластера (чтобы меньше платить за трафик между сервисами).
4. **Публичный IP** — включить (для первого теста).
5. Доступ по SSH: укажите ключ или логин/пароль (по документации Yandex).
6. **Сеть**: та же VPC, что у PostgreSQL, если хотите подключаться к БД **без** публичного доступа к Postgres (тогда в `DATABASE_URL` используйте **внутренний** FQDN хоста из карточки кластера).
7. Группа безопасности: разрешить **входящий TCP 22** (SSH) и **TCP 3000** (приложение) с вашего IP или на время теста отовсюду.

### 6.3. Подключиться по SSH и установить Docker

```bash
ssh ubuntu@<ПУБЛИЧНЫЙ_IP_ВМ>
```

Дальше на ВМ (команды для Ubuntu, от root или через `sudo`):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER
```

Перелогиньтесь в SSH или выполните `newgrp docker`.

### 6.4. Войти в Container Registry с ВМ

Скопируйте JSON-ключ сервисного аккаунта на ВМ (`scp` или вставка в редактор). Затем:

```bash
cat ключ.json | docker login --username json_key --password-stdin cr.yandex
```

(формат из [документации Container Registry](https://cloud.yandex.ru/docs/container-registry/operations/authentication) — при необходимости уточните актуальный способ для `json_key`.)

### 6.5. Запустить контейнер

Подставьте свой `DATABASE_URL` и пароль админки:

```bash
docker pull cr.yandex/<ID_РЕЕСТРА>/split-checkout:latest

docker run -d --name checkout --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e ADMIN_PASSWORD="ваш_секретный_пароль" \
  cr.yandex/<ID_РЕЕСТРА>/split-checkout:latest
```

Откройте в браузере: `http://<ПУБЛИЧНЫЙ_IP_ВМ>:3000/checkout`.

Проверка БД: `http://<IP>:3000/api/health` — ожидается `{"ok":true,"database":"up"}`.

### 6.6. HTTPS и домен

Для продакшена обычно подключают **Application Load Balancer**, сертификат в **Certificate Manager** и свой домен — это отдельный этап после рабочего HTTP.

---

## 7. Альтернатива: Serverless Containers

Можно запускать тот же образ без ВМ: сервис **Serverless Containers** в консоли — указать образ из `cr.yandex`, порт **3000**, переменные окружения. Для публичного HTTPS часто используют связку с **API Gateway** — см. [документацию Serverless Containers](https://cloud.yandex.ru/docs/serverless-containers/). Для первого опыта чаще проще путь с ВМ (раздел 6).

---

## Частые проблемы

| Симптом | Что проверить |
|--------|----------------|
| Не подключается к PostgreSQL с ноутбука | Публичный доступ к хостам / группа безопасности на **6432** / кодирование пароля в URL |
| `migrate deploy` падает с SSL | Строка с `?sslmode=require` |
| `docker push` — отказ в доступе | `yc container registry configure-docker`, правильный ID реестра |
| На ВМ `docker pull` — 401/403 | Роль `container-registry.images.puller`, корректный `docker login` |
| `/api/health` — `database: down` | С ВМ в ту же VPC — внутренний FQDN Postgres; с другой сети — снова firewall и строка подключения |

---

## Краткий чеклист

1. [ ] Каталог в Yandex Cloud  
2. [ ] Кластер PostgreSQL + доступ для миграций + строка `DATABASE_URL`  
3. [ ] `npm run db:migrate:deploy` с локального ПК  
4. [ ] Container Registry + `docker build` / `docker push`  
5. [ ] ВМ + Docker + `docker run` с `DATABASE_URL` и `ADMIN_PASSWORD`  
6. [ ] Проверка `/checkout` и `/api/health`  
