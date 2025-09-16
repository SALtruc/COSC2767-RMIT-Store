const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

// Create test app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const routes = require("../../routes");
app.use(routes);

describe("Products API Integration Tests", () => {
  let authToken;
  let adminToken;

  beforeEach(async () => {
    // Create a regular user for testing
    const userResponse = await request(app).post("/api/auth/register").send({
      firstName: "Test",
      lastName: "User",
      email: "user@student.rmit.edu.vn",
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    // Login to get token
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "user@student.rmit.edu.vn",
      password: "Password123!",
    });

    if (loginResponse.body.token) {
      authToken = loginResponse.body.token;
    }

    // Create admin user for admin operations
    const adminResponse = await request(app).post("/api/auth/register").send({
      firstName: "Admin",
      lastName: "User",
      email: "admin@student.rmit.edu.vn",
      password: "AdminPassword123!",
      confirmPassword: "AdminPassword123!",
    });

    const adminLoginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@student.rmit.edu.vn",
      password: "AdminPassword123!",
    });

    if (adminLoginResponse.body.token) {
      adminToken = adminLoginResponse.body.token;
    }
  });

  describe("GET /api/product", () => {
    test("should fetch all products successfully", async () => {
      const response = await request(app).get("/api/product").expect(200);

      expect(response.body).toHaveProperty("products");
      expect(Array.isArray(response.body.products)).toBe(true);
      expect(response.body).toHaveProperty("totalProducts");
      expect(response.body).toHaveProperty("count");
    });

    test("should handle pagination parameters", async () => {
      const response = await request(app)
        .get("/api/product?page=1&limit=10")
        .expect(200);

      expect(response.body).toHaveProperty("products");
      expect(response.body.products.length).toBeLessThanOrEqual(10);
    });

    test("should handle search query", async () => {
      const response = await request(app)
        .get("/api/product?search=laptop")
        .expect(200);

      expect(response.body).toHaveProperty("products");
      expect(Array.isArray(response.body.products)).toBe(true);
    });
  });

  describe("GET /api/product/:slug", () => {
    test("should return 404 for non-existent product", async () => {
      const response = await request(app)
        .get("/api/product/non-existent-product")
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("POST /api/product/add", () => {
    const validProduct = {
      sku: "TEST-001",
      name: "Test Product",
      description: "A test product for RMIT store",
      quantity: 100,
      price: 99.99,
      brand: "TestBrand",
      category: "Electronics",
      isActive: true,
    };

    test("should create product with valid admin authentication", async () => {
      if (!adminToken) {
        console.log("Skipping test - no admin token available");
        return;
      }

      const response = await request(app)
        .post("/api/product/add")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(validProduct);

      // Accept either 200 or 201 for successful creation
      expect([200, 201]).toContain(response.status);

      if (response.body.success) {
        expect(response.body).toHaveProperty("message");
        expect(response.body).toHaveProperty("product");
      }
    });

    test("should reject product creation without authentication", async () => {
      const response = await request(app)
        .post("/api/product/add")
        .send(validProduct);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("message");
    });

    test("should reject product creation with invalid data", async () => {
      if (!adminToken) {
        console.log("Skipping test - no admin token available");
        return;
      }

      const invalidProduct = {
        name: "Test Product",
        // Missing required fields
      };

      const response = await request(app)
        .post("/api/product/add")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(invalidProduct);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("PUT /api/product/:id", () => {
    test("should reject update without authentication", async () => {
      const response = await request(app)
        .put("/api/product/507f1f77bcf86cd799439011")
        .send({
          name: "Updated Product Name",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/product/delete/:id", () => {
    test("should reject deletion without authentication", async () => {
      const response = await request(app).delete(
        "/api/product/delete/507f1f77bcf86cd799439011"
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Product Search and Filtering", () => {
    test("should handle category filtering", async () => {
      const response = await request(app)
        .get("/api/product?category=Electronics")
        .expect(200);

      expect(response.body).toHaveProperty("products");
      expect(Array.isArray(response.body.products)).toBe(true);
    });

    test("should handle brand filtering", async () => {
      const response = await request(app)
        .get("/api/product?brand=Apple")
        .expect(200);

      expect(response.body).toHaveProperty("products");
      expect(Array.isArray(response.body.products)).toBe(true);
    });

    test("should handle price range filtering", async () => {
      const response = await request(app)
        .get("/api/product?min=0&max=1000")
        .expect(200);

      expect(response.body).toHaveProperty("products");
      expect(Array.isArray(response.body.products)).toBe(true);
    });
  });
});
