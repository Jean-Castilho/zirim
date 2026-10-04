import BannerRepository from "../repository/BannerRepository.js";
import { ValidationError } from "../utils/handleResponse.js";

export default class BannerControllers {

    constructor() {
        this.repository = new BannerRepository();
    }
    
    async getBannerPageEditHome() {
        const banner = await this.repository.getBannerPrincipal();
        return { banner };
    }

    async updateBannerHome(req, res, next) {
        let uploadedFilename = null;
        try {
            const currentBanner = await this.repository.getBannerPrincipal();
            const oldImage = currentBanner?.imageUrl;

            if (req.file) {
                uploadedFilename = await this.repository.uploadImageToGridFS(req.file);
            }

            const imageUrl = uploadedFilename || oldImage;

            if (!imageUrl) {
                throw new ValidationError("O banner precisa ter uma imagem cadastrada.");
            }

            // Extração e formatação estrita apenas das informações essenciais do banner
            const rawTitle = req.body.title ?? req.body.titulo;
            const rawDescription = req.body.description ?? req.body.subtitulo;
            const rawLink = req.body.link;
            const rawTextoBotao = req.body.textoBotao;

            const bannerData = {
                title: typeof rawTitle === "string" ? rawTitle.trim() : "",
                description: typeof rawDescription === "string" ? rawDescription.trim() : "",
                link: typeof rawLink === "string" && rawLink.trim() ? rawLink.trim() : "/products",
                textoBotao: typeof rawTextoBotao === "string" && rawTextoBotao.trim() ? rawTextoBotao.trim() : "Ver Coleção",
                exibirBotao: req.body.exibirBotao === "true" || req.body.exibirBotao === true || req.body.exibirBotao === "on",
                ativo: req.body.ativo !== undefined 
                    ? (req.body.ativo === "true" || req.body.ativo === true || req.body.ativo === "on") 
                    : (currentBanner?.ativo ?? true),
                imageUrl
            };

            const updatedBanner = await this.repository.upsertBannerPrincipal(bannerData);

            // Exclusão assíncrona da imagem substituída somente após persistência garantida
            if (uploadedFilename && oldImage && oldImage !== uploadedFilename) {
                this.repository.deleteImageFromGridFS(oldImage).catch(err => {
                    console.error("Falha ao remover imagem antiga substituída:", err);
                });
            }

            const isHtmx = req.headers['hx-request'] === 'true';
            const isJsonOrHtmx = req.xhr || 
                isHtmx || 
                (req.headers.accept && req.headers.accept.includes('application/json'));

            if (isHtmx) {
                res.setHeader('HX-Trigger', JSON.stringify({
                    showNotification: {
                        message: "Banner principal atualizado com sucesso!",
                        type: "success"
                    }
                }));
                return res.status(200).send("");
            }

            if (!isJsonOrHtmx) {
                return res.redirect("/edit/home?success=true");
            }

            return res.status(200).json({
                success: true,
                message: "Banner principal atualizado com sucesso!",
                banner: updatedBanner
            });
        } catch (error) {
            // Em caso de falha, remove a imagem recém-enviada para não deixar resíduo órfão
            if (uploadedFilename) {
                await this.repository.deleteImageFromGridFS(uploadedFilename).catch(err => {
                    console.error("Falha na limpeza de imagem órfã após erro:", err);
                });
            }
            next(error);
        }
    }

    async updateCategoryHome(req, res, next) {
        let uploadedFilename = null;
        try {
            if (!req.file) {
                throw new ValidationError("A imagem da categoria é obrigatória.");
            }

            const rawTitle = req.body.title;
            const rawLink = req.body.link;

            if (!rawTitle || !rawTitle.trim()) {
                throw new ValidationError("O título da categoria é obrigatório.");
            }

            uploadedFilename = await this.repository.uploadImageToGridFS(req.file);

            const categoryItem = {
                id: Date.now().toString(),
                title: rawTitle.trim(),
                link: typeof rawLink === "string" && rawLink.trim() ? rawLink.trim() : "/products",
                imageUrl: uploadedFilename
            };

            await this.repository.addCategory(categoryItem);

            const isHtmx = req.headers['hx-request'] === 'true';
            const isJsonOrHtmx = req.xhr || 
                isHtmx || 
                (req.headers.accept && req.headers.accept.includes('application/json'));

            if (isHtmx) {
                res.setHeader('HX-Trigger', JSON.stringify({
                    showNotification: {
                        message: "Categoria adicionada com sucesso!",
                        type: "success"
                    }
                }));
                res.setHeader('HX-Refresh', 'true');
                return res.status(200).send("");
            }

            if (!isJsonOrHtmx) {
                return res.redirect("/edit/home?success=true");
            }
            return res.status(200).json({
                success: true,
                message: "Categoria adicionada com sucesso!",
                category: categoryItem
            });
        } catch (error) {
            if (uploadedFilename) {
                await this.repository.deleteImageFromGridFS(uploadedFilename).catch(err => {
                    console.error("Falha na limpeza de imagem órfã após erro:", err);
                });
            }
            next(error);
        }
    }

    async deleteCategoryHome(req, res, next) {
        try {
            const { id } = req.params;
            const currentBanner = await this.repository.getBannerPrincipal();
            const categoryToDelete = currentBanner?.categories?.find(c => c.id === id);

            await this.repository.removeCategory(id);

            if (categoryToDelete?.imageUrl) {
                this.repository.deleteImageFromGridFS(categoryToDelete.imageUrl).catch(err => {
                    console.error("Falha ao remover imagem da categoria excluída:", err);
                });
            }

            return res.redirect("/edit/home");
        } catch (error) {
            next(error);
        }
    }
    
}