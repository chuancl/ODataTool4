import React, { useState } from 'react';
import { Button, Input, Card, CardBody, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip } from "@nextui-org/react";
import { faker } from '@faker-js/faker';
import { ODataVersion, generateSAPUI5Code } from '@/utils/odata-helper';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { Sparkles, Code2, Plus } from 'lucide-react';

interface Props {
  url: string;
  version: ODataVersion;
}

const MockDataGenerator: React.FC<Props> = ({ url, version }) => {
  const [count, setCount] = useState('5');
  const [mockData, setMockData] = useState<any[]>([]);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [generatedCode, setGeneratedCode] = useState('');

  const generateData = () => {
    const num = parseInt(count) || 5;
    const newData = Array.from({ length: num }).map((_, i) => ({
      ID: i + 1,
      Name: faker.commerce.productName(),
      Price: faker.commerce.price(),
      Description: faker.commerce.productDescription(),
      CreatedDate: faker.date.recent().toISOString()
    }));
    setMockData(newData);
  };

  const handleGenerateCode = () => {
    if (mockData.length === 0) return;
    const code = generateSAPUI5Code('create', 'Products', { data: mockData[0] }, version);
    setGeneratedCode(code);
    onOpen();
  };

  const columnHelper = createColumnHelper<any>();
  const columns = mockData.length > 0 ? Object.keys(mockData[0]).map(key => 
    columnHelper.accessor(key, { header: key })
  ) : [];

  const table = useReactTable({
    data: mockData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <Card className="border-none shadow-md bg-gradient-to-br from-content1 to-content2">
        <CardBody className="p-6">
           <div className="flex flex-col md:flex-row gap-6 items-end justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
                  <Sparkles className="text-warning" />
                  Smart Generator
                </h3>
                <p className="text-small text-default-500 mb-4">
                  Generate realistic mock data based on OData metadata entities (Simulation).
                </p>
                <div className="flex gap-4 items-center">
                  <Input 
                    label="Row Count" 
                    type="number" 
                    value={count} 
                    onValueChange={setCount} 
                    className="max-w-[120px]" 
                    variant="bordered"
                    size="sm"
                  />
                  <Button color="primary" onPress={generateData} startContent={<Plus size={18}/>} className="font-semibold">
                    Generate Data
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-2">
                 <Button 
                   color="secondary" 
                   variant="flat"
                   isDisabled={mockData.length === 0} 
                   onPress={handleGenerateCode}
                   startContent={<Code2 size={18}/>}
                 >
                   Get SAPUI5 Create Code
                 </Button>
              </div>
           </div>
        </CardBody>
      </Card>

      <div className="border border-divider rounded-xl bg-content1 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
        {mockData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id}>
                    {hg.headers.map(h => (
                      <th key={h.id} className="border-b border-divider p-3 bg-content2 text-xs font-semibold text-default-600">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-content2/50 border-b border-divider/50 last:border-0">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="p-3 text-sm text-default-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-default-300 gap-2">
            <Sparkles size={48} className="opacity-20" />
            <p>Ready to generate mock data</p>
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>SAPUI5 Batch Create Code</ModalHeader>
              <ModalBody>
                <div className="bg-[#1e1e1e] p-4 rounded-lg text-white font-mono text-sm overflow-auto max-h-[400px]">
                  <pre>{generatedCode}</pre>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={onClose}>Done</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default MockDataGenerator;