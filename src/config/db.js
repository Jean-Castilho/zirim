import dotenv from "dotenv";
import { MongoClient, GridFSBucket } from "mongodb";
import { backfillProductSearchText } from "../utils/search-text.js";
import { backfillVariationIds } from "../utils/variation-backfill.js";
dotenv.config();

const uri = process.env.DATABASE_URL;

if (!uri) {
  throw new Error(
    "A variável de ambiente DATABASE_URL não foi definida no arquivo .env",
  );
}

const client = new MongoClient(uri);
const DB_NAME = "zirim";
const INIT_COLLECTION_NAME = "_app_init";

let db;
let bucket;

export const connectDataBase = async () => {
  try {
    console.log("Conectando ao banco de dados...");
    await client.connect();
    console.log("Conexão com o MongoDB estabelecida com sucesso.");

    db = client.db(DB_NAME);

    const existingCollection = await db
      .listCollections({ name: INIT_COLLECTION_NAME })
      .toArray();

    if (existingCollection.length === 0) {
      await db.createCollection(INIT_COLLECTION_NAME);
      console.log(
        `Banco de dados "${DB_NAME}" criado com a coleção inicial "${INIT_COLLECTION_NAME}".`,
      );
    }

    // Gerenciamento de índices de usuários
    const usersCollection = db.collection("users");
    try {
      await usersCollection.createIndex({ "email.endereco": 1 }, { unique: true, name: "UserEmailUnique" });
      await usersCollection.createIndex({ "phone.number": 1 }, { unique: true, name: "UserPhoneUnique" });
      console.log("Índices de usuários configurados com sucesso.");
    } catch (err) {
      console.warn("Aviso ao criar índices de usuários:", err.message);
    }

    // Gerenciamento de índices de pedidos
    const ordersCollection = db.collection("orders");
    try {
      await ordersCollection.createIndex({ "user._id": 1 }, { name: "OrderUserIndex" });
      await ordersCollection.createIndex({ "payment.id": 1 }, { name: "OrderPaymentIdIndex" });
      await ordersCollection.createIndex({ statusInterno: 1, createdAt: -1 }, { name: "OrderStatusCreatedAtIndex" });
      console.log("Índices de pedidos configurados com sucesso.");
    } catch (err) {
      console.warn("Aviso ao criar índices de pedidos:", err.message);
    }

    // Gerenciamento de índice de texto para busca nativa
    const productsCollection = db.collection("products");
    
    try {
      // O MongoDB permite apenas UM índice de texto por coleção.
      // Precisamos remover o antigo se houver conflito de configuração ou nome.
      const indexes = await productsCollection.listIndexes().toArray();
      const textIndex = indexes.find(idx => idx.textIndexVersion);
      
      if (textIndex && textIndex.name !== "ProductSearchIndex") {
        console.log(`Removendo índice de texto antigo: ${textIndex.name}`);
        await productsCollection.dropIndex(textIndex.name);
      }

      await productsCollection.createIndex({
        nome: "text",
        "variacoes.cores": "text",
        "variacoes.tamanhos": "text",
        "variacoes.sku": "text",
        categoria: "text"
      }, {
        name: "ProductSearchIndex",
        default_language: "portuguese"
      });
      console.log("Índice de texto nativo configurado com sucesso.");
    } catch (indexError) {
      console.warn("Aviso na criação de índice:", indexError.message);
      // Não bloqueia a inicialização se for apenas um aviso de índice
    }

    // Campo de busca normalizado: preenche produtos cadastrados antes dessa versão
    try {
      const updated = await backfillProductSearchText(productsCollection);
      if (updated) console.log(`Campo de busca preenchido em ${updated} produto(s).`);
    } catch (err) {
      console.warn("Aviso ao preencher o campo de busca:", err.message);
    }

    // Identificador estável por variação: obrigatório antes de processar pagamentos (baixa de estoque)
    try {
      const withIds = await backfillVariationIds(productsCollection);
      if (withIds) console.log(`Identificador de variação criado em ${withIds} produto(s).`);
    } catch (err) {
      console.error("Falha ao criar identificadores de variação:", err.message);
      throw err;
    }

    bucket = new GridFSBucket(db, { bucketName: "uploads" });
  } catch (error) {
    console.error("Erro ao conectar ao banco de dados:", error);
    throw error;
  }
};

export const DataBase = () => {
  if (!db)
    throw new Error("A conexão com o banco de dados não foi inicializada.");
  return db;
};

export const getGridFSBucket = () => {
  if (!bucket) throw new Error("O GridFSBucket não foi inicializado.");
  return bucket;
};

export const closeDataBase = async () => {
  await client.close();
  console.log("Conexão com o banco de dados fechada.");
};
