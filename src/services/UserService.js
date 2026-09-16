import UserRepository from "../repository/UserRepository.js";
import { ValidationError, GeneralError } from "../utils/handleResponse.js";
import { compararPassword, createHashPassword } from "./authServices.js";
import { validateUser } from "./validationData.js";

export default class UserService {
    constructor() {
        this.repository = new UserRepository();
    }

    async authenticate(email, password) {
        const user = await this.repository.findByEmailForAuth(email);
        if (!user) throw new ValidationError("Usuário não encontrado.");

        const isMatch = await compararPassword(password, user.password);
        if (!isMatch) throw new ValidationError("Email ou senha incorretos.");

        return user;
    }

    async registerUser(userData) {
        const validation = validateUser(userData);
        if (!validation.isValid) {
            throw new ValidationError(validation.errors[0].message, validation.errors);
        }

        const data = validation.data;

        const emailExists = await this.repository.findByEmail(data.email);
        if (emailExists) throw new GeneralError("Este e-mail já está sendo utilizado.", 409);

        const phoneExists = await this.repository.findByPhone(data.phone);
        if (phoneExists) throw new GeneralError("Este número de telefone já está sendo utilizado.", 409);

        data.password = await createHashPassword(data.password);
        return await this.repository.create(data);
    }

    async verifyAndUpgradeUser(userId) {
        const updated = await this.repository.updateProfile(userId, { emailVerified: true });
        if (!updated) throw new Error("Falha ao atualizar status de verificação.");
        return await this.repository.findById(userId);
    }
}