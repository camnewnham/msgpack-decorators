import { key } from "../src";

it("throws an error when generating keys for a non-messagepack class", () => {
  const create = () => {
    class NonMessagePackClass {
      public item0: string;
      public item2: number;
    }

    class TestClass {
      @key(0)
      elem: NonMessagePackClass;
    }
  };
  expect(create).toThrowError();
});

it("throws an error when generating keys for a class declared in the wrong order ", () => {
  const create = () => {
    class TestClass {
      @key(0)
      elem: NonMessagePackClass;
    }

    class NonMessagePackClass {
      @key(0)
      public item0: string;
      @key(1)
      public item2: number;
    }
  };
  expect(create).toThrowError();
});
