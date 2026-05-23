import dotenv from "dotenv";
import { MongoClient, GridFSBucket } from "mongodb";
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

    bucket = new GridFSBucket(db, { bucketName: "uploads" });
  } catch (error) {
    console.error("Erro ao conectar ao banco de dados:", error);
    throw error;
  }
};

export const getDataBase = () => {
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
