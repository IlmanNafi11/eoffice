FROM node:22-alpine AS assets

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY resources resources
COPY vite.config.js tsconfig.json ./
RUN npm run build


FROM php:8.4-cli

RUN apt-get update && apt-get install -y \
    libpq-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libwebp-dev \
    libfreetype6-dev \
    libzip-dev \
    libonig-dev \
    libxml2-dev \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-jpeg --with-freetype --with-webp \
    && docker-php-ext-install \
    pdo_pgsql \
    gd \
    mbstring \
    xml \
    dom \
    zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY --from=assets /app/public/build /app/public/build

# Baseline produksi (bukan php.ini-development: `display_errors=On` +
# `expose_php=On` membocorkan stack/fingerprint di luar handler Laravel,
# ship#14 F2) + memory_limit 256M untuk render PDF dompdf (peak < 200M).
# Log PHP ke stderr agar audit trail ikut ke collector orchestrator.
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && printf 'memory_limit = 256M\nexpose_php = Off\nlog_errors = On\nerror_log = /dev/stderr\n' \
    > "$PHP_INI_DIR/conf.d/eoffice.ini"

WORKDIR /app
