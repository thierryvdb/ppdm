# Use a imagem oficial do Node.js LTS
FROM node:20-alpine

# Defina o diretório de trabalho no container
WORKDIR /app

# Copie os arquivos de dependências
COPY package*.json ./

# Instale as dependências
RUN npm install --production

# Copie o restante dos arquivos da aplicação
COPY . .

# Exponha a porta que a aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "start"]
