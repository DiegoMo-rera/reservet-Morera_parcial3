# Reservet · Gestión de Mesas y Autenticación (Prueba Técnica)

Aplicación web para la gestión operativa de mesas de un restaurante con **autenticación basada en sesiones persistentes, control de acceso en backend, interfaz multilingüe (ES/EN/RU) y persistencia en PostgreSQL**.

---

## 1. Requisitos previos (sin Docker)

- **Node.js**: v22.13 o superior (`node --version`)
- **npm**: v10 o superior (`npm --version`)
- **PostgreSQL**: v17 ejecutándose localmente (`psql --version`)
- **Git**: (`git --version`)

---

## 2. Instalación y preparación de PostgreSQL

### Paso 1: Crear usuario y bases de datos en PostgreSQL

Conéctate a PostgreSQL como administrador (`psql -U postgres` o mediante pgAdmin con autocommit activado) y ejecuta estas sentencias **por separado**:

```sql
CREATE ROLE reservet_candidate LOGIN PASSWORD 'local_candidate_password';
CREATE DATABASE reservet_candidate OWNER reservet_candidate;
CREATE DATABASE reservet_candidate_test OWNER reservet_candidate;
```
