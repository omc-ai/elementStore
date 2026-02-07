#
# ElementStore PHP + Phalcon Container
#
# PHP 8.3 with Phalcon 5.x extension for running ElementStore API
#
# Build:
#   docker build -f Dockerfile.php -t elementstore-php .
#
# Run:
#   docker run -p 8080:80 -v $(pwd)/..:/var/www/elementStore elementstore-php
#

FROM php:8.3-apache

LABEL maintainer="Agura <dev@agura.tech>"
LABEL description="ElementStore PHP + Phalcon runtime"
LABEL version="1.0.0"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libzip-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install \
    zip \
    curl \
    pdo \
    pdo_mysql

# Install Phalcon extension
ARG PSR_VERSION=1.2.0
ARG PHALCON_VERSION=5.6.1

# Install PSR extension (required by Phalcon)
RUN curl -LO https://github.com/jbboehr/php-psr/archive/v${PSR_VERSION}.tar.gz \
    && tar xzf v${PSR_VERSION}.tar.gz \
    && cd php-psr-${PSR_VERSION} \
    && phpize \
    && ./configure \
    && make \
    && make install \
    && docker-php-ext-enable psr \
    && cd .. \
    && rm -rf php-psr-${PSR_VERSION} v${PSR_VERSION}.tar.gz

# Install Phalcon extension
RUN curl -LO https://github.com/phalcon/cphalcon/archive/v${PHALCON_VERSION}.tar.gz \
    && tar xzf v${PHALCON_VERSION}.tar.gz \
    && cd cphalcon-${PHALCON_VERSION}/build \
    && ./install \
    && docker-php-ext-enable phalcon \
    && cd ../.. \
    && rm -rf cphalcon-${PHALCON_VERSION} v${PHALCON_VERSION}.tar.gz

# Install MongoDB extension (optional, for MongoStorageProvider)
RUN pecl install mongodb \
    && docker-php-ext-enable mongodb

# Enable Apache mod_rewrite
RUN a2enmod rewrite headers

# Configure Apache
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Create Apache virtual host
COPY apache-vhost.conf /etc/apache2/sites-available/000-default.conf

# Set working directory
WORKDIR /var/www/elementStore

# Create data directory with proper permissions
RUN mkdir -p /var/www/data && chown -R www-data:www-data /var/www/data

# PHP configuration
RUN echo "display_errors = Off" >> /usr/local/etc/php/conf.d/elementstore.ini \
    && echo "error_reporting = E_ALL" >> /usr/local/etc/php/conf.d/elementstore.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/conf.d/elementstore.ini \
    && echo "error_log = /var/log/php_errors.log" >> /usr/local/etc/php/conf.d/elementstore.ini \
    && echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/elementstore.ini \
    && echo "upload_max_filesize = 50M" >> /usr/local/etc/php/conf.d/elementstore.ini \
    && echo "post_max_size = 50M" >> /usr/local/etc/php/conf.d/elementstore.ini

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

EXPOSE 80

CMD ["apache2-foreground"]
