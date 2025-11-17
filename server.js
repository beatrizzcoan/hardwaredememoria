const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;

// Serve todos os arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(
    `Servidor rodando! Abra http://localhost:${PORT} no seu navegador.`,
  );
});
