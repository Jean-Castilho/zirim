import BaseController from "./BaseController.js";
import UserService from "../services/UserService.js";
import { requireSessionUser } from "../utils/session.js";

/**
 * Gestão de usuários: perfil próprio e administração.
 */
export default class UserController extends BaseController {
    constructor(userService = new UserService()) {
        super();
        this.users = userService;
    }

    async updateProfile(req, res) {
        const sessionUser = requireSessionUser(req);

        const updatedUser = await this.users.updateOwnProfile(sessionUser._id, { name: req.body.name });
        req.session.user.name = updatedUser.name;

        return this.ok(res, "Perfil atualizado com sucesso.", { user: updatedUser });
    }

    async updateUser(req, res) {
        const updatedUser = await this.users.adminUpdateUser(req.params.id, req.body);
        return this.ok(res, "Usuário atualizado com sucesso.", { user: updatedUser });
    }

    async deleteUser(req, res) {
        await this.users.deleteUser(req.params.id);
        return this.respond(req, res, { message: "Usuario excluido com sucesso." });
    }
}
