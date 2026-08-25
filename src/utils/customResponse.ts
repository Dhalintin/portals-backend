// src/utils/customResponse.ts

import { Response } from "express";

interface CustomResponseParams {
  status: number;
  res: Response;
  success: boolean;
  message: string;
  data?: any;
  error?: any;
}

export const customResponse = ({
  status,
  res,
  success,
  message,
  data,
  error,
}: CustomResponseParams): void => {
  const responseBody: any = {
    success,
    message,
  };

  if (data !== undefined) {
    responseBody.data = data;
  }

  if (error !== undefined) {
    responseBody.error = error;
  }

  res.status(status).json(responseBody);
};
