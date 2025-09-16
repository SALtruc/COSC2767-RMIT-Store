const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

describe("Utility Functions Unit Tests", () => {
  describe("Password Hashing", () => {
    test("should hash password correctly", async () => {
      const password = "TestPassword123!";
      const saltRounds = 10;

      const hashedPassword = await bcrypt.hash(password, saltRounds);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(20);
    });

    test("should verify password correctly", async () => {
      const password = "TestPassword123!";
      const hashedPassword = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(password, hashedPassword);
      const isInvalid = await bcrypt.compare("WrongPassword", hashedPassword);

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });
  });

  describe("JWT Token Operations", () => {
    const testSecret = "test-secret-key";
    const testPayload = {
      id: "507f1f77bcf86cd799439011",
      email: "test@student.rmit.edu.vn",
      role: "user",
    };

    test("should create JWT token correctly", () => {
      const token = jwt.sign(testPayload, testSecret, { expiresIn: "1h" });

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    test("should verify JWT token correctly", () => {
      const token = jwt.sign(testPayload, testSecret, { expiresIn: "1h" });
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.id).toBe(testPayload.id);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    test("should reject invalid JWT token", () => {
      const invalidToken = "invalid.token.here";

      expect(() => {
        jwt.verify(invalidToken, testSecret);
      }).toThrow();
    });

    test("should reject expired JWT token", () => {
      const expiredToken = jwt.sign(testPayload, testSecret, {
        expiresIn: "-1h",
      });

      expect(() => {
        jwt.verify(expiredToken, testSecret);
      }).toThrow();
    });
  });

  describe("MongoDB ObjectId Validation", () => {
    test("should validate valid ObjectId", () => {
      const validId = "507f1f77bcf86cd799439011";
      const isValid = mongoose.Types.ObjectId.isValid(validId);

      expect(isValid).toBe(true);
    });

    test("should reject invalid ObjectId", () => {
      const invalidIds = [
        "invalid-id",
        "123",
        "",
        null,
        undefined,
        "not-an-objectid-at-all",
      ];

      invalidIds.forEach((id) => {
        const isValid = mongoose.Types.ObjectId.isValid(id);
        expect(isValid).toBe(false);
      });
    });

    test("should create new ObjectId correctly", () => {
      const objectId = new mongoose.Types.ObjectId();

      expect(objectId).toBeDefined();
      expect(objectId.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
    });
  });

  describe("Email Validation", () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    test("should validate correct email formats", () => {
      const validEmails = [
        "student@rmit.edu.vn",
        "test.user@student.rmit.edu.vn",
        "admin@rmit.edu.vn",
        "user123@gmail.com",
        "test+tag@example.org",
      ];

      validEmails.forEach((email) => {
        expect(emailRegex.test(email)).toBe(true);
      });
    });

    test("should reject invalid email formats", () => {
      const invalidEmails = [
        "invalid-email",
        "@rmit.edu.vn",
        "user@",
        "user@.com",
        "user..name@test.com",
        "",
        null,
        undefined,
      ];

      invalidEmails.forEach((email) => {
        if (email !== null && email !== undefined) {
          expect(emailRegex.test(email)).toBeFalsy();
        }
      });
    });
  });

  describe("Price Calculation Functions", () => {
    test("should calculate total price correctly", () => {
      const items = [
        { price: 99.99, quantity: 2 },
        { price: 149.5, quantity: 1 },
        { price: 29.99, quantity: 3 },
      ];

      const total = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const expected = 99.99 * 2 + 149.5 * 1 + 29.99 * 3;

      expect(total).toBe(expected);
      expect(total).toBeCloseTo(439.45, 2);
    });

    test("should calculate tax correctly", () => {
      const subtotal = 100.0;
      const taxRate = 0.1; // 10% tax
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      expect(tax).toBe(10.0);
      expect(total).toBe(110.0);
    });

    test("should handle discount calculation", () => {
      const originalPrice = 200.0;
      const discountPercent = 15; // 15% discount
      const discountAmount = (originalPrice * discountPercent) / 100;
      const finalPrice = originalPrice - discountAmount;

      expect(discountAmount).toBe(30.0);
      expect(finalPrice).toBe(170.0);
    });

    test("should handle currency formatting", () => {
      const price = 1234.56;
      const formatted = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
      }).format(price);

      expect(formatted).toContain("$1,234.56");
    });
  });

  describe("String Utility Functions", () => {
    test("should create slug from product name", () => {
      const productNames = [
        { name: "iPhone 15 Pro Max", expected: "iphone-15-pro-max" },
        { name: "MacBook Air M2", expected: "macbook-air-m2" },
        {
          name: "Samsung Galaxy S24 Ultra",
          expected: "samsung-galaxy-s24-ultra",
        },
      ];

      productNames.forEach(({ name, expected }) => {
        const slug = name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        expect(slug).toBe(expected);
      });
    });

    test("should truncate long descriptions", () => {
      const longText =
        "This is a very long product description that needs to be truncated for display purposes in the RMIT e-commerce store catalog.";
      const maxLength = 50;

      const truncated =
        longText.length > maxLength
          ? longText.substring(0, maxLength) + "..."
          : longText;

      expect(truncated.length).toBeLessThanOrEqual(maxLength + 3);
      expect(truncated).toContain("...");
    });

    test("should capitalize first letter of words", () => {
      const testCases = [
        { input: "john doe", expected: "John Doe" },
        { input: "MARY JANE", expected: "Mary Jane" },
        { input: "product name", expected: "Product Name" },
      ];

      testCases.forEach(({ input, expected }) => {
        const capitalized = input
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase());
        expect(capitalized).toBe(expected);
      });
    });
  });

  describe("Date Utility Functions", () => {
    test("should format date correctly", () => {
      const testDate = new Date("2025-09-16T10:30:00Z");
      const formatted = testDate.toISOString().split("T")[0];

      expect(formatted).toBe("2025-09-16");
    });

    test("should calculate date difference", () => {
      const date1 = new Date("2025-09-16");
      const date2 = new Date("2025-09-20");
      const diffInDays = Math.abs((date2 - date1) / (1000 * 60 * 60 * 24));

      expect(diffInDays).toBe(4);
    });

    test("should check if date is in the past", () => {
      const pastDate = new Date("2020-01-01");
      const futureDate = new Date("2030-01-01");
      const now = new Date();

      expect(pastDate < now).toBe(true);
      expect(futureDate > now).toBe(true);
    });

    test("should add days to date", () => {
      const startDate = new Date("2025-09-16");
      const daysToAdd = 7;
      const newDate = new Date(startDate);
      newDate.setDate(startDate.getDate() + daysToAdd);

      expect(newDate.toISOString().split("T")[0]).toBe("2025-09-23");
    });
  });

  describe("Array Utility Functions", () => {
    test("should remove duplicates from array", () => {
      const arrayWithDuplicates = [1, 2, 2, 3, 4, 4, 5];
      const uniqueArray = [...new Set(arrayWithDuplicates)];

      expect(uniqueArray).toEqual([1, 2, 3, 4, 5]);
      expect(uniqueArray.length).toBe(5);
    });

    test("should sort products by price", () => {
      const products = [
        { name: "Product A", price: 99.99 },
        { name: "Product B", price: 149.99 },
        { name: "Product C", price: 49.99 },
      ];

      const sortedByPriceAsc = [...products].sort((a, b) => a.price - b.price);
      const sortedByPriceDesc = [...products].sort((a, b) => b.price - a.price);

      expect(sortedByPriceAsc[0].price).toBe(49.99);
      expect(sortedByPriceDesc[0].price).toBe(149.99);
    });

    test("should filter products by price range", () => {
      const products = [
        { name: "Cheap Product", price: 25.0 },
        { name: "Medium Product", price: 75.0 },
        { name: "Expensive Product", price: 150.0 },
      ];

      const minPrice = 50;
      const maxPrice = 100;
      const filtered = products.filter(
        (product) => product.price >= minPrice && product.price <= maxPrice
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("Medium Product");
    });
  });

  describe("Validation Helper Functions", () => {
    test("should validate required fields", () => {
      const requiredFields = ["name", "email", "password"];
      const validData = {
        name: "John Doe",
        email: "john@test.com",
        password: "password123",
      };
      const invalidData = {
        name: "John Doe",
        email: "john@test.com",
        // missing password
      };

      const isValid = (data) =>
        requiredFields.every(
          (field) => data[field] && data[field].toString().trim()
        );

      expect(isValid(validData)).toBe(true);
      expect(isValid(invalidData)).toBe(false);
    });

    test("should validate password strength", () => {
      const strongPasswords = [
        "StrongPass123!",
        "MySecure@Pass2024",
        "Complex#Password1",
      ];

      const weakPasswords = ["password", "123456", "abc", "PASSWORD"];

      // Simple password strength check (at least 8 chars, contains number and special char)
      const isStrong = (password) => {
        return (
          password.length >= 8 &&
          /\d/.test(password) &&
          /[!@#$%^&*(),.?":{}|<>]/.test(password)
        );
      };

      strongPasswords.forEach((password) => {
        expect(isStrong(password)).toBe(true);
      });

      weakPasswords.forEach((password) => {
        expect(isStrong(password)).toBe(false);
      });
    });
  });
});
