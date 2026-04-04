# Code for ai to fix for testing

# Correct calculator test code
def calculator():
    num1 = float(input("Enter first number: "))
    op = input("Enter operation (+, -, *, /): ")
    num2 = float(input("Enter second number: "))

    if op == "+":
        print(num1 + num2)
    elif op == "-":
        print(num1 - num2)
    elif op == "*":
        print(num1 * num2)
    elif op == "/":
        if num2 != 0:
            print(num1 / num2)
        else:
            print("Error: Division by zero")
    else:
        print("Invalid operation")

calculator()

# Incorrect calculator test code
def calculator():
    num1 = float(input("Enter first number: "))
    op = input("Enter operation (+, -, *, /): ")
    num2 = float(input("Enter second number: "))

    if op == "+":
        print(num1 - num2)
    elif op == "-":
        print(num1 + num2)
    elif op == "*":
        print(num1 * num2)
    elif op == "/":
        if num2 == 0:
            print(num1 / num2)
        else:
            print("Division result:", num1 / num2)
    else:
        print("Invalid operation")
        print("Defaulting to addition:", num1 + num2)

calculator()