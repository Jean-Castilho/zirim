import BannerRepository from "../repository/BannerRepository.js";
import { ValidationError } from "../utils/errors.js";

const DEFAULT_LINK = "/products";

const cleanString = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const toBool = (value) => value === true || value === "true" || value === "on";

/**
 * Regras do banner principal e das categorias da home (incluindo ciclo de vida das imagens).
 */
export default class BannerService {
  constructor(repository = new BannerRepository()) {
    this.repository = repository;
  }

  async getHomeBanner() {
    const banner = await this.repository.getBannerPrincipal();
    return { banner };
  }

  /** Remove uma imagem sem propagar falha (limpeza best-effort). */
  #discardImage(filename, context) {
    if (!filename) return Promise.resolve();
    return this.repository.deleteImageFromGridFS(filename).catch((err) => {
      console.error(`Falha ao remover imagem (${context}):`, err);
    });
  }

  async updateMainBanner(file, body = {}) {
    let uploadedFilename = null;
    try {
      const currentBanner = await this.repository.getBannerPrincipal();
      const oldImage = currentBanner?.imageUrl;

      if (file) uploadedFilename = await this.repository.uploadImageToGridFS(file);

      const imageUrl = uploadedFilename || oldImage;
      if (!imageUrl) throw new ValidationError("O banner precisa ter uma imagem cadastrada.");

      const bannerData = {
        title: cleanString(body.title ?? body.titulo),
        description: cleanString(body.description ?? body.subtitulo),
        link: cleanString(body.link, DEFAULT_LINK),
        textoBotao: cleanString(body.textoBotao, "Ver Coleção"),
        exibirBotao: toBool(body.exibirBotao),
        ativo: body.ativo !== undefined ? toBool(body.ativo) : (currentBanner?.ativo ?? true),
        imageUrl,
      };

      const banner = await this.repository.upsertBannerPrincipal(bannerData);

      // Só remove a imagem antiga após persistir o novo banner
      if (uploadedFilename && oldImage && oldImage !== uploadedFilename) {
        void this.#discardImage(oldImage, "banner substituído");
      }
      return banner;
    } catch (error) {
      await this.#discardImage(uploadedFilename, "limpeza após erro");
      throw error;
    }
  }

  async addCategory(file, body = {}) {
    if (!file) throw new ValidationError("A imagem da categoria é obrigatória.");
    const title = cleanString(body.title);
    if (!title) throw new ValidationError("O título da categoria é obrigatório.");

    let uploadedFilename = null;
    try {
      uploadedFilename = await this.repository.uploadImageToGridFS(file);

      const category = {
        id: Date.now().toString(),
        title,
        link: cleanString(body.link, DEFAULT_LINK),
        imageUrl: uploadedFilename,
      };
      await this.repository.addCategory(category);
      return category;
    } catch (error) {
      await this.#discardImage(uploadedFilename, "limpeza após erro");
      throw error;
    }
  }

  async removeCategory(categoryId) {
    const banner = await this.repository.getBannerPrincipal();
    const category = banner?.categories?.find((c) => c.id === categoryId);

    await this.repository.removeCategory(categoryId);
    void this.#discardImage(category?.imageUrl, "categoria excluída");
  }
}
