import BaseController from "./base.controller.js";
import BannerService from "../services/banner.service.js";

/**
 * Banner principal e categorias da página inicial (área administrativa).
 */
export default class BannerController extends BaseController {
    constructor(bannerService = new BannerService()) {
        super();
        this.banners = bannerService;
    }

    async updateMain(req, res) {
        const banner = await this.banners.updateMainBanner(req.file, req.body);
        return this.respond(req, res, {
            message: "Banner principal atualizado com sucesso!",
            data: { banner },
            redirectTo: "/edit/home?success=true",
            htmx: { notify: true },
        });
    }

    async addCategory(req, res) {
        const category = await this.banners.addCategory(req.file, req.body);
        return this.respond(req, res, {
            message: "Categoria adicionada com sucesso!",
            data: { category },
            redirectTo: "/edit/home?success=true",
            htmx: { notify: true, refresh: true },
        });
    }

    async removeCategory(req, res) {
        await this.banners.removeCategory(req.params.id);
        return res.redirect("/edit/home");
    }
}
