#!/usr/bin/env bash

DATA_DIR="../../../tests"

echo -e "\nTesting common schemas:"
for data_file in ${DATA_DIR}/common/**/*.json; do
    echo "Validating $data_file"
    ./validate-json-data.js "$data_file" > "$data_file.log" 2>&1
    if [ $? -ne 0 ]; then
        echo -e "Error in $data_file\n";
    fi
done

echo -e "\nTesting major schemas:"
for data_file in ${DATA_DIR}/**/*.json; do
    echo "Validating $data_file"
    ./validate-json-data.js "$data_file" > "$data_file.log" 2>&1
    if [ $? -ne 0 ]; then
        echo -e "Error in $data_file\n";
    fi
done
