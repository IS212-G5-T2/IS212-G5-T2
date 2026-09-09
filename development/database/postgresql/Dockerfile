FROM postgres:16-alpine

ENV POSTGRES_USER=spm
ENV POSTGRES_PASSWORD=spm_dev_password
ENV POSTGRES_DB=spm

COPY init/ /docker-entrypoint-initdb.d/
