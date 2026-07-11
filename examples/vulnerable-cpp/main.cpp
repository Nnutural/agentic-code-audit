#include <cstring>
#include <iostream>

int main(int argc, char **argv) {
    if (argc < 2) {
        return 1;
    }

    char destination[32];
    std::strcpy(destination, argv[1]);
    std::cout << destination << '\n';
    return 0;
}
