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

# Envelope de dev/prod: 256M menutup render PDF (dompdf WebP→PNG) dan test
# suite tanpa memotong fitur; memory_get_peak_usage nyata < 200M.
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini" \
    && echo "memory_limit = 256M" > "$PHP_INI_DIR/conf.d/memory.ini"

WORKDIR /app
