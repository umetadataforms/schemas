#!/usr/bin/env bash

DATA_DIR="../../../tests"
EXAMPLES_DIR="../../../examples"

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

echo -e "\nTesting examples:"
for data_file in ${EXAMPLES_DIR}/**/*.json; do
  echo "Validating $data_file"
  rel=${data_file#${EXAMPLES_DIR}/}
  log_file=$DATA_DIR/examples/${rel}.log
  mkdir -p "$(dirname "$log_file")"
  ./validate-json-data.js "$data_file" > "$log_file" 2>&1
  if [ $? -ne 0 ]; then
    echo -e "Error in $data_file\n";
  fi
done
