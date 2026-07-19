# Frame Extractor Frontend

Frontend React para consumir a API do Frame Extractor.

## Funcionalidades

- login e cadastro;
- upload de varios videos;
- acompanhamento dos jobs em exportacao;
- download do ZIP completo;
- leitura do ZIP no navegador para visualizar frames exportados;
- download de frames individualmente.

## Requisitos

- Node.js 20+
- API backend rodando em `http://localhost:8080`

## Configuracao

Opcionalmente crie `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8080
```

## Rodar

```bash
npm install
npm run dev
```

Acesse:

```text
http://localhost:5173
```

## Observacao

A API atual disponibiliza o resultado como `.zip`. Por isso, a visualizacao dos frames acontece no proprio navegador: o frontend baixa o ZIP do job concluido, abre com `JSZip` e renderiza as imagens contidas nele.

Se o navegador bloquear chamadas por CORS, habilite o backend para aceitar a origem do Vite:

```properties
quarkus.http.cors=true
quarkus.http.cors.origins=http://localhost:5173
quarkus.http.cors.methods=GET,POST,OPTIONS
quarkus.http.cors.headers=accept,authorization,content-type
```
