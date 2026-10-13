import BaseController from "./BaseController.js";
import UserService from "../services/UserService.js";
import OrderService from "../services/OrderService.js";
import { requireSessionUser } from "../utils/session.js";

/**
 * Páginas de conta: login, cadastro, recuperação de senha, verificação e perfil.
 */
export default class AuthPagesController extends BaseController {
  constructor(userService = new UserService(), orderService = new OrderService()) {
    super();
    this.users = userService;
    this.orders = orderService;
  }

  async login(req, res) {
    return this.render(req, res, "../pages/auth/login", {
      titulo: "Login",
      message: "seja Bem vindo de volta...",
    });
  }

  async register(req, res) {
    return this.render(req, res, "../pages/auth/register", {
      titulo: "Registrar Conta",
      message: "Crie sua conta para começar a comprar!",
    });
  }

  async resetPassword(req, res) {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const tokenIsValid = token ? await this.users.isPasswordResetTokenValid(token) : false;

    if (token && !tokenIsValid) {
      return this.render(req, res, "../pages/auth/reset-password", {
        titulo: "Link expirado",
        message: "Este link não é válido ou já expirou. Solicite uma nova redefinição.",
        invalidToken: true,
      });
    }

    const resetMode = Boolean(tokenIsValid);
    return this.render(req, res, "../pages/auth/reset-password", {
      titulo: resetMode ? "Definir nova senha" : "Recuperando senha",
      message: resetMode
        ? "Escolha uma senha segura para sua conta."
        : "Informe seu e-mail para receber um link de redefinição.",
      resetMode,
      token,
    });
  }

  async verifyOtp(req, res) {
    if (!req.session?.user?.email?.endereco) return res.redirect("/login");
    return res.redirect("/verify-contact?type=email");
  }

  async verifyContact(req, res) {
    const type = ["phone", "email"].includes(req.query.type) ? req.query.type : null;
    if (!type) return res.redirect("/profile");

    const user = await this.users.getUserById(requireSessionUser(req)._id);
    if (!user) return res.redirect("/login");

    const contact = type === "phone" ? user.phone?.number || "" : user.email?.endereco || "";
    if (type === "email" && !contact) return res.redirect("/profile");

    return this.render(req, res, "../pages/auth/verify-contact", {
      titulo: type === "phone" ? "Verificar telefone" : "Verificar e-mail",
      type,
      contact,
      verified: type === "phone" ? Boolean(user.phone?.verified) : Boolean(user.email?.verified),
    });
  }

  async profile(req, res) {
    const userId = req.session?.user?._id;
    if (!userId) return res.redirect("/login");

    const [user, orders] = await Promise.all([
      this.users.getUserById(userId),
      this.orders.getUserOrderSummaries(userId),
    ]);

    const userProfile = { ...user, orderns: orders };
    res.locals.user = userProfile;

    return this.render(req, res, "../pages/auth/profile", {
      titulo: "Meu Perfil",
      message: "Gerencie suas informações de perfil!",
      user: userProfile,
    });
  }
}
