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

let db;
let bucket;

export const connectDataBase = async () => {
  try {
    console.log("Conectando ao banco de dados...");
    await client.connect();
    console.log("Conexão com o MongoDB estabelecida com sucesso.");

    db = client.db("Harpia");
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
