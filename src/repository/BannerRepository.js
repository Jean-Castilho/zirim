
import BaseRepository from "./BaseRepository.js";


export default class OrderRepository extends BaseRepository {
  
    constructor() {
        super("orders");
    }

    get db() {
        return DataBase();
    }

    getCollection() {
        return this.db.collection("banners");
    }

    async postBannersPrincipal() {

    }

    async postFeaturedcategories() {

    }

};