import { GridFSBucket } from "mongodb";
import sharp from "sharp";
import { DataBase, getGridFSBucket } from "../config/db.js";
import BaseRepository from "./BaseRepository.js";

export default class BannerRepository extends BaseRepository {
    constructor() {
        super("banners");
    }
    
    getBucket() {
        try {
            return getGridFSBucket();
        } catch {
            return new GridFSBucket(DataBase(), { bucketName: "uploads" });
        }
    }

    async getBannerPrincipal() {
        const banner = await this.collection.findOne({
            $or: [
                { tipo: "principal" },
                { tipo: "hero" },
                { tipo: "hero_principal" },
                { local: "hero" }
            ]
        }) || await this.collection.findOne({}, { sort: { _id: 1 } });

        if (!banner) return null;

        // Retorna schema unificado e normalizado
        return {
            ...banner,
            title: banner.title ?? banner.titulo ?? "",
            description: banner.description ?? banner.subtitulo ?? "",
            imageUrl: banner.imageUrl ?? banner.imagem ?? null,
            link: banner.link || "/products",
            textoBotao: banner.textoBotao || "Ver Coleção",
            exibirBotao: banner.exibirBotao !== false,
            ativo: banner.ativo !== false
        };
    }

    async uploadImageToGridFS(file) {
        if (!file?.buffer) return null;

        const bucket = this.getBucket();
        const rawName = (file.originalname || "banner")
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `banner-${Date.now()}-${rawName}.webp`;

        return new Promise((resolve, reject) => {
            const uploadStream = bucket.openUploadStream(filename, {
                contentType: "image/webp",
                metadata: { originalname: file.originalname }
            });

            const transformer = sharp(file.buffer)
                .resize({ width: 1920, fit: "inside", withoutEnlargement: true })
                .toFormat("webp", { quality: 82 });

            transformer.on("error", (err) => {
                uploadStream.abort().catch(() => {});
                reject(err);
            });

            uploadStream.on("finish", () => resolve(filename));
            uploadStream.on("error", (err) => reject(err));

            transformer.pipe(uploadStream);
        });
    }

    async deleteImageFromGridFS(filename) {
        if (!filename) return;
        try {
            const db = DataBase();
            const file = await db.collection("uploads.files").findOne(
                { filename },
                { projection: { _id: 1 } }
            );
            if (file) {
                await this.getBucket().delete(file._id);
            }
        } catch (error) {
            console.error(`Erro ao remover imagem antiga do GridFS (${filename}):`, error);
        }
    }

    async upsertBannerPrincipal(data) {
        const filter = {
            $or: [
                { tipo: "principal" },
                { tipo: "hero" },
                { tipo: "hero_principal" },
                { local: "hero" }
            ]
        };

        const update = {
            $set: {
                title: data.title ?? "",
                description: data.description ?? "",
                imageUrl: data.imageUrl,
                link: data.link || "/products",
                textoBotao: data.textoBotao || "Ver Coleção",
                exibirBotao: Boolean(data.exibirBotao),
                ativo: data.ativo !== false,
                tipo: "principal",
                local: "hero",
                updatedAt: new Date()
            },
            $unset: {
                // Elimina chaves legadas e redundantes do banco
                titulo: "",
                subtitulo: "",
                imagem: ""
            },
            $setOnInsert: { createdAt: new Date() }
        };

        return await this.collection.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' });
    }

};