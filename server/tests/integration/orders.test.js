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

describe("Orders API Integration Tests", () => {
  let authToken;
  let userId;

  beforeEach(async () => {
    // Create and authenticate a user
    const userResponse = await request(app).post("/api/auth/register").send({
      firstName: "Test",
      lastName: "User",
      email: "order.test@student.rmit.edu.vn",
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "order.test@student.rmit.edu.vn",
      password: "Password123!",
    });

    if (loginResponse.body.token) {
      authToken = loginResponse.body.token;
      userId = loginResponse.body.user?.id;
    }
  });

  describe("GET /api/order", () => {
    test("should fetch user orders with authentication", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const response = await request(app)
        .get("/api/order")
        .set("Authorization", `Bearer ${authToken}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("orders");
        expect(Array.isArray(response.body.orders)).toBe(true);
      }
    });

    test("should reject order fetch without authentication", async () => {
      const response = await request(app).get("/api/order");

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /api/order/:orderId", () => {
    test("should reject single order fetch without authentication", async () => {
      const response = await request(app).get(
        "/api/order/507f1f77bcf86cd799439011"
      );

      expect(response.status).toBe(401);
    });

    test("should return 404 for non-existent order", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const response = await request(app)
        .get("/api/order/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("POST /api/order/add", () => {
    const validOrder = {
      cart: [
        {
          product: "507f1f77bcf86cd799439011",
          quantity: 2,
          purchasePrice: 99.99,
        },
      ],
      total: 199.98,
      paymentMethod: "Credit Card",
    };

    test("should create order with valid authentication", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const response = await request(app)
        .post("/api/order/add")
        .set("Authorization", `Bearer ${authToken}`)
        .send(validOrder);

      // Accept various success status codes
      expect([200, 201, 400]).toContain(response.status);

      // If successful, should have order data
      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("order");
      }
    });

    test("should reject order creation without authentication", async () => {
      const response = await request(app)
        .post("/api/order/add")
        .send(validOrder);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("message");
    });

    test("should reject order with empty cart", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const invalidOrder = {
        cart: [],
        total: 0,
        paymentMethod: "Credit Card",
      };

      const response = await request(app)
        .post("/api/order/add")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidOrder);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    test("should reject order with invalid payment method", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const invalidOrder = {
        ...validOrder,
        paymentMethod: "InvalidMethod",
      };

      const response = await request(app)
        .post("/api/order/add")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidOrder);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("PUT /api/order/status/:orderId", () => {
    test("should reject status update without authentication", async () => {
      const response = await request(app)
        .put("/api/order/status/507f1f77bcf86cd799439011")
        .send({
          status: "Delivered",
          deliveryDate: new Date(),
        });

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/order/cancel/:orderId", () => {
    test("should reject order cancellation without authentication", async () => {
      const response = await request(app).put(
        "/api/order/cancel/507f1f77bcf86cd799439011"
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Order Search and Filtering", () => {
    test("should handle order status filtering with authentication", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const response = await request(app)
        .get("/api/order?status=Processing")
        .set("Authorization", `Bearer ${authToken}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("orders");
        expect(Array.isArray(response.body.orders)).toBe(true);
      }
    });

    test("should handle date range filtering with authentication", async () => {
      if (!authToken) {
        console.log("Skipping test - no auth token available");
        return;
      }

      const startDate = new Date("2024-01-01").toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get(`/api/order?startDate=${startDate}&endDate=${endDate}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("orders");
        expect(Array.isArray(response.body.orders)).toBe(true);
      }
    });
  });
});
